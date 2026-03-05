import { getGeminiAgent, GeminiTool, GeminiFunctionCall } from './gemini-agent';
import { getMCPClientManager } from './mcp-client';

export interface ConversationMessage {
  role: 'user' | 'model';
  content: string;
}

export interface AssistantRunOptions {
  message: string;
  conversationHistory?: ConversationMessage[];
  useMCPTools?: boolean;
  maxToolIterations?: number;
}

export interface AssistantRunResult {
  finalText: string;
  toolCalls: Array<{
    tool: string;
    arguments: Record<string, any>;
    result: any;
  }>;
}

const BASE_SYSTEM_PROMPT = `You are WAKALAT.AI, a senior legal analyst assisting Indian advocates.

Responsibilities:
- Analyse user submissions about legal matters with Indian law as primary reference.
- Always include a short disclaimer that your analysis is for informational purposes only and not a substitute for formal legal advice.
- When statutes, sections, or precedents are relevant, cite them clearly.
- Consider procedural guidance (next steps, documentation, timelines) when appropriate.`;

const TOOL_INSTRUCTIONS = `

MCP TOOLING - CRITICAL INSTRUCTIONS
You have access to specialized legal research tools through the Model Context Protocol (MCP) server. These tools are ESSENTIAL for accurate legal research.

WHEN TO USE TOOLS:
- ALWAYS use search_precedents when the user asks about precedents, case law, or similar cases
- ALWAYS use find_case_laws when searching for specific case laws
- ALWAYS use legal_research for general legal research queries
- Use analyze_document when documents need analysis
- Use draft_legal_notice for drafting notices
- Use check_limitation for limitation period queries

MANDATORY WORKFLOW:
1. When the user asks about legal research, precedents, or case laws, you MUST call the appropriate tool(s) FIRST
2. Wait for the tool results
3. Then synthesize the information and provide your response

DO NOT skip tool usage - these tools provide accurate legal data that you cannot access otherwise.`;

function getSystemPrompt(hasTools: boolean): string {
  if (hasTools) {
    return BASE_SYSTEM_PROMPT + TOOL_INSTRUCTIONS;
  }
  return BASE_SYSTEM_PROMPT + `\n\nNote: No specialized legal research tools are currently available. Provide the best possible response based on your knowledge of Indian law.`;
}

const DEFAULT_MAX_TOOL_ITERATIONS = 3;

function buildUserPrompt(userMessage: string, hasTools: boolean): string {
  return `${getSystemPrompt(hasTools)}\n\nUSER REQUEST:\n${userMessage}`;
}

export async function runLegalAssistant(options: AssistantRunOptions): Promise<AssistantRunResult> {
  const { message, conversationHistory = [], useMCPTools = true } = options;
  // Note: maxIterations reserved for future multi-iteration tool calling support
  // const maxIterations = options.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;

  const geminiAgent = getGeminiAgent();
  if (!geminiAgent.isConfigured()) {
    throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY environment variable.');
  }

  const toolCalls: AssistantRunResult['toolCalls'] = [];
  let geminiTools: GeminiTool[] = [];
  const toolManager = getMCPClientManager();
  
  // Get connection status for diagnostics
  const mcpStatus = toolManager.getStatus();
  const isMCPConnected = toolManager.isConnected();

  // Fetch MCP tools and convert them to Gemini format
  if (useMCPTools && isMCPConnected) {
    try {
      console.log(`[Legal Assistant] MCP connection status: ${isMCPConnected}`);
      console.log(`[Legal Assistant] MCP status details:`, JSON.stringify(mcpStatus, null, 2));
      
      const mcpTools = await toolManager.listTools();
      const availableTools = Array.isArray(mcpTools) ? mcpTools : [];
      
      console.log(`[Legal Assistant] Retrieved ${availableTools.length} tools from MCP server`);
      
      if (availableTools.length > 0) {
        const toolNames = availableTools.map((t: any) => t.name || 'unnamed');
        console.log(`[Legal Assistant] Available tools:`, toolNames.join(', '));
        
        // Convert MCP tools to Gemini format
        geminiTools = availableTools.map((mcpTool: any) => {
          const converted = geminiAgent.convertMCPToolToGeminiTool(mcpTool);
          console.log(`[Legal Assistant] Converted tool "${converted.name}":`, {
            hasDescription: !!converted.description,
            description: converted.description?.substring(0, 100),
            hasParameters: !!converted.parameters,
            parameterCount: converted.parameters?.properties ? Object.keys(converted.parameters.properties).length : 0,
            parameters: converted.parameters?.properties ? Object.keys(converted.parameters.properties) : [],
          });
          return converted;
        });
        
        console.log(`[Legal Assistant] Successfully converted ${geminiTools.length} tools to Gemini format`);
        console.log(`[Legal Assistant] Tool details:`, JSON.stringify(geminiTools.map(t => ({
          name: t.name,
          description: t.description,
          parameterNames: t.parameters?.properties ? Object.keys(t.parameters.properties) : [],
        })), null, 2));
      } else {
        console.warn(`[Legal Assistant] No tools available from MCP server. Response was:`, JSON.stringify(mcpTools, null, 2));
        console.warn(`[Legal Assistant] Proceeding without MCP tools. The assistant will use general knowledge only.`);
      }
    } catch (error) {
      console.error('[Legal Assistant] Unable to list MCP tools:', error);
      console.error('[Legal Assistant] Error details:', error instanceof Error ? error.stack : error);
      geminiTools = [];
    }
  } else {
    const reason = !useMCPTools ? 'MCP tools disabled' : 'MCP server not connected';
    console.log(`[Legal Assistant] ${reason}. useMCPTools: ${useMCPTools}, isConnected: ${isMCPConnected}`);
    console.log(`[Legal Assistant] MCP status:`, JSON.stringify(mcpStatus, null, 2));
  }

  // Create function call handler
  const functionCallHandler = async (call: GeminiFunctionCall): Promise<any> => {
    if (!toolManager.isConnected()) {
      throw new Error('MCP server is not connected');
    }

    try {
      console.log(`[Legal Assistant] Executing MCP tool: ${call.name} with args:`, call.args);
      const result = await toolManager.callTool(call.name, call.args);
      
      // Track the tool call
      toolCalls.push({
        tool: call.name,
        arguments: call.args,
        result: result,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error calling MCP tool.';
      console.error(`[Legal Assistant] Error calling tool ${call.name}:`, error);
      
      // Track the failed tool call
      toolCalls.push({
        tool: call.name,
        arguments: call.args,
        result: { error: errorMessage },
      });

      throw error;
    }
  };

  // Build the prompt - system prompt adapts based on tool availability
  const hasTools = geminiTools.length > 0;
  const prompt = buildUserPrompt(message, hasTools);

  // Generate response with function calling support
  try {
    console.log('[Legal Assistant] Generating response with:', {
      toolsCount: geminiTools.length,
      toolNames: geminiTools.map(t => t.name),
      hasConversationHistory: conversationHistory.length > 0,
    });
    
    const response = await geminiAgent.generateResponse(prompt, {
      tools: geminiTools.length > 0 ? geminiTools : undefined,
      conversationHistory,
      functionCallHandler: geminiTools.length > 0 ? functionCallHandler : undefined,
    });

    let responseText = response.text || '';
    
    // Ensure we have a response text
    if (!responseText || responseText.trim() === '') {
      console.warn('[Legal Assistant] Empty response from Gemini.');
      console.warn('[Legal Assistant] Diagnostic info:', {
        toolCallsCount: toolCalls.length,
        geminiToolsCount: geminiTools.length,
        isMCPConnected,
        mcpStatus,
        message: message.substring(0, 100) + '...',
      });
      
      // If we had tool calls but no response, provide a helpful message
      if (toolCalls.length > 0) {
        responseText = `I attempted to search for precedents using the available tools, but didn't receive a response. ` +
          `This might indicate:\n\n` +
          `1. The MCP server tool may not be responding correctly\n` +
          `2. The tool may require different parameters\n` +
          `3. There may be a connection issue with the MCP server\n\n` +
          `Tool calls attempted: ${toolCalls.map(c => c.tool).join(', ')}\n\n` +
          `Please check the MCP connection panel and verify the tool is available.`;
      } else {
        // Build detailed diagnostic message
        const diagnosticInfo = [];
        
        if (!isMCPConnected) {
          diagnosticInfo.push(`❌ MCP server is NOT connected`);
          if (mcpStatus.error) {
            diagnosticInfo.push(`   Error: ${mcpStatus.error}`);
          }
        } else {
          diagnosticInfo.push(`✅ MCP server is connected`);
        }
        
        if (geminiTools.length === 0) {
          diagnosticInfo.push(`❌ No MCP tools available (${geminiTools.length} tools)`);
          if (isMCPConnected) {
            diagnosticInfo.push(`   This suggests the MCP server is connected but not exposing any tools.`);
            diagnosticInfo.push(`   Check the MCP connection panel to see available tools.`);
          } else {
            diagnosticInfo.push(`   Connect to MCP server first using the connection panel (bottom-right corner).`);
          }
        } else {
          diagnosticInfo.push(`✅ ${geminiTools.length} MCP tool(s) available: ${geminiTools.map(t => t.name).join(', ')}`);
          diagnosticInfo.push(`   Gemini should have attempted to use these tools.`);
        }
        
        diagnosticInfo.push(`\n📋 Message sent: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);
        
        responseText = `I couldn't generate a response. Diagnostic information:\n\n${diagnosticInfo.join('\n')}\n\n` +
          `Please check:\n` +
          `1. MCP server connection status (use the connection panel in bottom-right corner)\n` +
          `2. Available tools in the MCP connection panel\n` +
          `3. Server console logs for detailed error information\n` +
          `4. Gemini API key is configured correctly`;
      }
    }

    return {
      finalText: responseText,
      toolCalls,
    };
  } catch (error) {
    console.error('[Legal Assistant] Error generating response:', error);
    console.error('[Legal Assistant] Error details:', error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name,
    } : error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      finalText: `An error occurred while processing your request: ${errorMessage}\n\n` +
        `Please check:\n` +
        `1. MCP server is connected (check connection panel)\n` +
        `2. Gemini API key is configured\n` +
        `3. Server logs for more details`,
      toolCalls,
    };
  }
}



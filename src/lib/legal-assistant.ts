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

const BASE_SYSTEM_PROMPT = `You are WAKALAT.AI, an AI Legal Analyst powered by the Wakalat MCP (Model Context Protocol) server.

YOUR IDENTITY:
- You are the frontend interface for the Wakalat-AI MCP server — a suite of specialized Indian legal tools.
- You work best when connected to the Wakalat MCP server, which gives you access to real legal research tools.
- When asked about your capabilities, always mention your MCP tools by name and what they do.

YOUR MCP TOOLS (when connected):
1. search_precedents — Search Indian Supreme Court & High Court judgments for relevant precedents
2. find_case_laws — Find specific case laws by citation, party name, or legal provision
3. legal_research — Conduct comprehensive legal research on any topic with statute & case law citations
4. analyze_document — Analyze legal documents (petitions, contracts, affidavits, notices)
5. draft_legal_notice — Draft professional legal notices (demand, cease & desist, termination, breach, defamation)
6. check_limitation — Check limitation periods under the Limitation Act, 1963

IMPORTANT RULES:
- Always include a disclaimer that your analysis is for informational purposes only.
- When statutes, sections, or precedents are relevant, cite them clearly.
- This app exists to demonstrate the Wakalat MCP server capabilities. Always highlight when you're using an MCP tool.`;

const TOOL_INSTRUCTIONS = `

MCP TOOLS ARE ACTIVE — USE THEM.

MANDATORY: When the user's query matches a tool, you MUST call it. Do not answer from memory alone.
- Precedent/case law questions → call search_precedents or find_case_laws
- Legal research questions → call legal_research
- Document analysis → call analyze_document
- Draft a notice → call draft_legal_notice
- Limitation period questions → call check_limitation

After receiving tool results, synthesize them into a clear, structured response. Mention which tool you used.`;

const NO_TOOLS_MESSAGE = `

⚠️ MCP SERVER NOT CONNECTED
You do not currently have access to your MCP tools. Your responses will be based on general legal knowledge only.
When responding, tell the user:
- You are not connected to the Wakalat MCP server right now
- They should connect via the MCP connection panel (bottom-right corner) to unlock the full tool suite
- Without MCP, your responses are limited to general knowledge and may not have real-time legal data
Still try to help with general Indian law knowledge, but always note the limitation.`;

function getSystemPrompt(hasTools: boolean): string {
  return BASE_SYSTEM_PROMPT + (hasTools ? TOOL_INSTRUCTIONS : NO_TOOLS_MESSAGE);
}

function buildUserPrompt(userMessage: string, hasTools: boolean): string {
  return `${getSystemPrompt(hasTools)}\n\nUSER REQUEST:\n${userMessage}`;
}

export async function runLegalAssistant(options: AssistantRunOptions): Promise<AssistantRunResult> {
  const { message, conversationHistory = [], useMCPTools = true } = options;

  const geminiAgent = getGeminiAgent();
  if (!geminiAgent.isConfigured()) {
    throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY environment variable.');
  }

  const toolCalls: AssistantRunResult['toolCalls'] = [];
  let geminiTools: GeminiTool[] = [];
  const toolManager = getMCPClientManager();
  const isMCPConnected = toolManager.isConnected();

  // Fetch MCP tools and convert them to Gemini format
  if (useMCPTools && isMCPConnected) {
    try {
      const mcpTools = await toolManager.listTools();
      const availableTools = Array.isArray(mcpTools) ? mcpTools : [];

      if (availableTools.length > 0) {
        geminiTools = availableTools.map((mcpTool: any) =>
          geminiAgent.convertMCPToolToGeminiTool(mcpTool)
        );
        console.log(`[Legal Assistant] ${geminiTools.length} MCP tools ready: ${geminiTools.map(t => t.name).join(', ')}`);
      }
    } catch (error) {
      console.error('[Legal Assistant] Unable to list MCP tools:', error);
      geminiTools = [];
    }
  } else {
    console.log(`[Legal Assistant] MCP not available. connected=${isMCPConnected}, useMCPTools=${useMCPTools}`);
  }

  // Create function call handler
  const functionCallHandler = async (call: GeminiFunctionCall): Promise<any> => {
    if (!toolManager.isConnected()) {
      throw new Error('MCP server is not connected');
    }

    try {
      console.log(`[Legal Assistant] Calling MCP tool: ${call.name}`, call.args);
      const result = await toolManager.callTool(call.name, call.args);
      toolCalls.push({ tool: call.name, arguments: call.args, result });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Legal Assistant] Tool ${call.name} failed:`, error);
      toolCalls.push({ tool: call.name, arguments: call.args, result: { error: errorMessage } });
      throw error;
    }
  };

  const hasTools = geminiTools.length > 0;
  const prompt = buildUserPrompt(message, hasTools);

  try {
    const response = await geminiAgent.generateResponse(prompt, {
      tools: hasTools ? geminiTools : undefined,
      conversationHistory,
      functionCallHandler: hasTools ? functionCallHandler : undefined,
    });

    let responseText = response.text || '';

    if (!responseText.trim()) {
      if (toolCalls.length > 0) {
        responseText = `I called the MCP tool(s) ${toolCalls.map(c => c.tool).join(', ')} but didn't get a synthesized response. The raw tool results are available. Please try again.`;
      } else if (!isMCPConnected) {
        responseText = `I'm WAKALAT.AI, but I'm not currently connected to the Wakalat MCP server, so I can't access my legal research tools.\n\nPlease connect to the MCP server using the connection panel (bottom-right corner) to unlock:\n- Legal precedent search\n- Case law finder\n- Legal research\n- Document analysis\n- Notice drafting\n- Limitation period checking`;
      } else {
        responseText = `I couldn't generate a response. Please check the MCP server connection and try again.`;
      }
    }

    return { finalText: responseText, toolCalls };
  } catch (error) {
    console.error('[Legal Assistant] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      finalText: `Error: ${errorMessage}\n\nPlease check the MCP connection panel and server logs.`,
      toolCalls,
    };
  }
}

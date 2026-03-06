import { getGeminiAgent, GeminiTool, GeminiFunctionCall } from './gemini-agent';
import { getMCPClientManager } from './mcp-client';

export interface ConversationMessage {
  role: 'user' | 'model';
  content: string;
}

export interface ToolCallEvent {
  type: 'tool_call_start' | 'tool_call_end';
  tool: string;
  args?: Record<string, any>;
  success?: boolean;
  error?: string;
  durationMs?: number;
}

export interface StreamEvent {
  type: 'log' | 'text' | 'done' | 'error';
  data: ToolCallEvent | { content: string } | { error: string } | Record<string, never>;
}

export interface FileAttachment {
  name: string;
  mimeType: string;
  base64Data: string;
}

export interface AssistantRunOptions {
  message: string;
  conversationHistory?: ConversationMessage[];
  useMCPTools?: boolean;
  maxToolIterations?: number;
  attachments?: FileAttachment[];
  onEvent?: (event: StreamEvent) => void;
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

MCP TOOLS ARE ACTIVE — USE THEM. You can call tools MULTIPLE TIMES across multiple steps.

MANDATORY: When the user's query matches a tool, you MUST call it. Do not answer from memory alone.
- Precedent/case law questions → call search_precedents or find_case_laws
- Legal research questions → call legal_research
- Document analysis → call analyze_document
- Draft a notice → call draft_legal_notice
- Limitation period questions → call check_limitation

WORKFLOW FOR GUIDED FORM SUBMISSIONS:
When you receive a "GUIDED FORM SUBMISSION", you MUST run a multi-step analysis. Do NOT stop after one tool call.

For CRIMINAL cases:
1. Call legal_research on the applicable sections and offence type
2. Call search_precedents for similar cases and defenses
3. Call check_limitation for filing deadlines
4. Synthesize everything into a comprehensive case analysis

For CIVIL cases:
1. Call legal_research on the type of dispute and relief sought
2. Call search_precedents for similar disputes and outcomes
3. Call check_limitation for the applicable limitation period
4. Synthesize into an analysis with recommended strategy

For CYBERCRIME cases:
1. Call legal_research on IT Act provisions and applicable IPC sections
2. Call search_precedents for similar cyber offence cases
3. Call check_limitation for complaint/FIR filing deadlines
4. Synthesize with technical-legal analysis

For FAMILY cases:
1. Call legal_research on the grounds for petition and applicable family law provisions
2. Call search_precedents for similar family matters (custody, maintenance, divorce grounds)
3. Call check_limitation for petition filing deadlines
4. Synthesize with analysis of rights, remedies, and likely outcomes

For ANY case type — after the analysis, if the case warrants a legal notice, also call draft_legal_notice.

IMPORTANT RULES FOR TOOL CALLS:
- Execute each step sequentially. After receiving results from one tool, use those results to inform the next tool call.
- Keep tool queries SHORT and FOCUSED. For example, use "divorce cruelty Hindu Marriage Act" not a 3-paragraph query.
- Use research_depth "basic" or "standard" — NEVER "comprehensive" (it causes timeouts).
- If a tool call FAILS or times out, do NOT retry the same tool. Move on to the next step and note the failure.
- Do NOT skip steps — if one tool fails, still call the remaining tools.

After ALL tool calls, synthesize everything into a structured response with:
- Case Summary
- Applicable Laws & Provisions
- Relevant Precedents
- Limitation Period
- Recommended Legal Strategy
- Disclaimer`;

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
  const { message, conversationHistory = [], useMCPTools = true, maxToolIterations = 5, onEvent } = options;
  const emit = (event: StreamEvent) => onEvent?.(event);

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

  // Extract text content from MCP tool result
  const extractMCPResult = (result: any): any => {
    // MCP returns { content: [{ type: "text", text: "..." }] }
    if (result && result.content && Array.isArray(result.content)) {
      const textParts = result.content
        .filter((c: any) => c.type === 'text' && c.text)
        .map((c: any) => c.text);
      if (textParts.length > 0) {
        return { result: textParts.join('\n') };
      }
    }
    // Fallback: return as-is
    return result;
  };

  // Create function call handler
  const functionCallHandler = async (call: GeminiFunctionCall): Promise<any> => {
    if (!toolManager.isConnected()) {
      throw new Error('MCP server is not connected');
    }

    const startTime = Date.now();
    emit({ type: 'log', data: { type: 'tool_call_start', tool: call.name, args: call.args } });

    try {
      console.log(`[Legal Assistant] Calling MCP tool: ${call.name}`, call.args);
      const rawResult = await toolManager.callTool(call.name, call.args);
      const result = extractMCPResult(rawResult);
      toolCalls.push({ tool: call.name, arguments: call.args, result });
      emit({ type: 'log', data: { type: 'tool_call_end', tool: call.name, success: true, durationMs: Date.now() - startTime } });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Legal Assistant] Tool ${call.name} failed:`, error);
      toolCalls.push({ tool: call.name, arguments: call.args, result: { error: errorMessage } });
      emit({ type: 'log', data: { type: 'tool_call_end', tool: call.name, success: false, error: errorMessage, durationMs: Date.now() - startTime } });
      throw error;
    }
  };

  const hasTools = geminiTools.length > 0;
  const textPrompt = buildUserPrompt(message, hasTools);

  // Build multimodal prompt if attachments are present
  let prompt: string | any[];
  if (options.attachments && options.attachments.length > 0) {
    const parts: any[] = [{ text: textPrompt }];
    for (const att of options.attachments) {
      parts.push({
        inlineData: {
          mimeType: att.mimeType,
          data: att.base64Data,
        },
      });
    }
    prompt = parts;
  } else {
    prompt = textPrompt;
  }

  try {
    const response = await geminiAgent.generateResponse(prompt, {
      tools: hasTools ? geminiTools : undefined,
      conversationHistory,
      functionCallHandler: hasTools ? functionCallHandler : undefined,
      maxIterations: maxToolIterations,
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

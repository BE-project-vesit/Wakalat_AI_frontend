// Gemini 2.5 Flash Agent Service with Native Function Calling
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL_NAME = 'gemini-2.5-flash'; // Using Gemini 2.5 Flash which supports function calling

const MAX_TOTAL_MS = 300_000; // 5 minute safety timeout for agentic loops

export interface GeminiTool {
  name: string;
  description?: string;
  parameters?: {
    type: SchemaType;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, any>;
}

class GeminiAgent {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;

  constructor() {
    if (GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      this.model = this.genAI.getGenerativeModel({ model: MODEL_NAME });
    }
  }

  /**
   * Check if Gemini is configured
   */
  isConfigured(): boolean {
    return !!GEMINI_API_KEY && !!this.genAI;
  }

  /**
   * Convert MCP tool schema to Gemini FunctionDeclaration format
   */
  convertMCPToolToGeminiTool(mcpTool: any): GeminiTool {
    const schema = mcpTool.input_schema || mcpTool.inputSchema || {};

    // Extract properties from schema
    const properties: Record<string, any> = {};
    const required: string[] = [];

    if (schema.properties) {
      Object.keys(schema.properties).forEach((key) => {
        const prop = schema.properties[key];
        const converted: Record<string, any> = {
          type: prop.type || 'string',
          description: prop.description || '',
        };
        if (prop.enum) {
          converted.enum = prop.enum;
        }
        if (prop.items) {
          converted.items = prop.items;
        }
        if (prop.default !== undefined) {
          converted.default = prop.default;
        }
        properties[key] = converted;
      });
    }

    if (schema.required && Array.isArray(schema.required)) {
      required.push(...schema.required);
    }

    return {
      name: mcpTool.name || 'unknown_tool',
      description: mcpTool.description || 'No description available',
      parameters: {
        type: SchemaType.OBJECT,
        properties,
        required: required.length > 0 ? required : undefined,
      },
    };
  }

  /**
   * Extract text from a Gemini response, trying multiple methods
   */
  private extractText(response: any): string {
    let text = '';
    try {
      text = response.text();
    } catch (e) {
      console.warn('[Gemini Agent] response.text() failed, trying alternative:', e);
    }

    if (!text) {
      const candidates = (response as any).candidates || [];
      if (candidates.length > 0) {
        const firstCandidate = candidates[0];
        if (firstCandidate.content && firstCandidate.content.parts) {
          const textParts = firstCandidate.content.parts
            .filter((part: any) => part.text)
            .map((part: any) => part.text);
          text = textParts.join('');
        }
      }
    }

    return text;
  }

  /**
   * Extract function calls from a Gemini response, checking both standard and candidate locations
   */
  private extractFunctionCalls(response: any): GeminiFunctionCall[] {
    const rawFunctionCalls = response.functionCalls;
    const responseFunctionCalls = Array.isArray(rawFunctionCalls) ? rawFunctionCalls : [];

    const candidates = (response as any).candidates || [];
    let candidateFunctionCalls: any[] = [];
    if (candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
      candidateFunctionCalls = candidates[0].content.parts
        .filter((part: any) => part.functionCall)
        .map((part: any) => part.functionCall);
    }

    // Deduplicate: if both sources return the same calls, prefer response.functionCalls
    // Use a simple check — if responseFunctionCalls is non-empty, skip candidate ones
    const allRaw = responseFunctionCalls.length > 0 ? responseFunctionCalls : candidateFunctionCalls;

    return allRaw.map((call: any) => ({
      name: call.name || call.functionName,
      args: call.args || {},
    }));
  }

  /**
   * Generate a response using Gemini with agentic multi-step function calling.
   * Loops until Gemini stops requesting tools or maxIterations is reached.
   */
  async generateResponse(
    prompt: string | any[],
    context?: {
      tools?: GeminiTool[];
      conversationHistory?: Array<{ role: 'user' | 'model'; content: string }>;
      functionCallHandler?: (call: GeminiFunctionCall) => Promise<any>;
      maxIterations?: number;
    }
  ): Promise<{ text: string; functionCalls?: GeminiFunctionCall[] }> {
    if (!this.model) {
      throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY environment variable.');
    }

    const maxIterations = context?.maxIterations ?? 5;

    try {
      const chat = this.model.startChat({
        history: (context?.conversationHistory || []).map((msg) => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        })),
        tools: context?.tools && context.tools.length > 0 ? [{
          functionDeclarations: context.tools.map((tool) => ({
            name: tool.name,
            description: tool.description || '',
            parameters: tool.parameters || {
              type: SchemaType.OBJECT,
              properties: {},
            },
          })),
        }] : undefined,
      });

      // Send the initial message
      const initialResult = await chat.sendMessage(prompt);
      let currentResponse = initialResult.response;
      const allFunctionCalls: GeminiFunctionCall[] = [];
      const startTime = Date.now();

      // Agentic loop: keep going while Gemini requests tool calls
      let iteration = 0;
      while (iteration < maxIterations && (Date.now() - startTime) < MAX_TOTAL_MS) {
        const roundFunctionCalls = this.extractFunctionCalls(currentResponse);

        console.log(`[Gemini Agent] Iteration ${iteration + 1}: ${roundFunctionCalls.length} function call(s)`);

        if (roundFunctionCalls.length === 0) {
          // No more tool calls — Gemini is done
          break;
        }

        iteration++;

        // Execute all function calls for this round
        const functionResponses: any[] = [];
        for (const call of roundFunctionCalls) {
          allFunctionCalls.push(call);

          if (context?.functionCallHandler) {
            try {
              const result = await context.functionCallHandler(call);
              functionResponses.push({ name: call.name, response: result });
            } catch (error) {
              console.error(`[Gemini Agent] Error executing function ${call.name}:`, error);
              functionResponses.push({
                name: call.name,
                response: { error: error instanceof Error ? error.message : 'Unknown error' },
              });
            }
          }
        }

        // Send tool results back to Gemini — it may request more tools or give a final answer
        if (functionResponses.length > 0) {
          const nextResult = await chat.sendMessage(
            functionResponses.map((fr) => ({
              functionResponse: {
                name: fr.name,
                response: fr.response,
              },
            }))
          );
          currentResponse = nextResult.response;
        } else {
          break;
        }
      }

      if (iteration >= maxIterations) {
        console.warn(`[Gemini Agent] Hit max iterations (${maxIterations}). Returning current response.`);
      }
      if ((Date.now() - startTime) >= MAX_TOTAL_MS) {
        console.warn(`[Gemini Agent] Hit time limit (${MAX_TOTAL_MS}ms). Returning current response.`);
      }

      let responseText = this.extractText(currentResponse);

      console.log(`[Gemini Agent] Final response: ${responseText?.length || 0} chars, ${allFunctionCalls.length} total tool calls`);

      // If we executed tools but got no synthesized text, ask Gemini to synthesize
      if ((!responseText || !responseText.trim()) && allFunctionCalls.length > 0) {
        console.log('[Gemini Agent] No text after tool calls — requesting synthesis');
        try {
          const synthesisResult = await chat.sendMessage(
            'Now synthesize all the tool results above into a comprehensive, structured response for the user. Include all key findings, relevant laws, precedents, and recommendations.'
          );
          responseText = this.extractText(synthesisResult.response);
          console.log(`[Gemini Agent] Synthesis response: ${responseText?.length || 0} chars`);
        } catch (synthError) {
          console.error('[Gemini Agent] Synthesis request failed:', synthError);
        }
      }

      // Log if we had tools but got nothing useful
      if (context?.tools && context.tools.length > 0 && !responseText?.trim() && allFunctionCalls.length === 0) {
        console.warn('[Gemini Agent] Warning: Tools available but no function calls made and no text returned.');
        console.warn('[Gemini Agent] Available tools:', context.tools.map(t => t.name));
      }

      return {
        text: responseText || '',
        functionCalls: allFunctionCalls.length > 0 ? allFunctionCalls : undefined,
      };
    } catch (error) {
      console.error('Gemini API error:', error);
      throw error;
    }
  }
}

// Singleton instance
let geminiAgent: GeminiAgent | null = null;

export function getGeminiAgent(): GeminiAgent {
  if (!geminiAgent) {
    geminiAgent = new GeminiAgent();
  }
  return geminiAgent;
}

export default getGeminiAgent();

// Gemini 2.5 Flash Agent Service with Native Function Calling
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL_NAME = 'gemini-2.5-flash'; // Using Gemini 2.5 Flash which supports function calling

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
        properties[key] = {
          type: prop.type || 'string',
          description: prop.description || '',
        };
        if (prop.items) {
          properties[key].items = prop.items;
        }
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
   * Generate a response using Gemini with native function calling support
   */
  async generateResponse(
    prompt: string,
    context?: {
      tools?: GeminiTool[];
      conversationHistory?: Array<{ role: 'user' | 'model'; content: string }>;
      functionCallHandler?: (call: GeminiFunctionCall) => Promise<any>;
    }
  ): Promise<{ text: string; functionCalls?: GeminiFunctionCall[] }> {
    if (!this.model) {
      throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY environment variable.');
    }

    try {
      // Build conversation history
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

      // Send the message
      const result = await chat.sendMessage(prompt);
      const response = result.response;

      // Debug logging - check response structure
      const finishReason = (response as any).finishReason || 'unknown';
      const candidates = (response as any).candidates || [];
      let rawResponseText = '';
      
      // Try multiple ways to get the text
      try {
        rawResponseText = response.text();
      } catch (e) {
        console.warn('[Gemini Agent] response.text() failed, trying alternative:', e);
      }
      
      // If text() returned empty but we have candidates, try extracting from candidates
      if (!rawResponseText && candidates.length > 0) {
        const firstCandidate = candidates[0];
        if (firstCandidate.content && firstCandidate.content.parts) {
          const textParts = firstCandidate.content.parts
            .filter((part: any) => part.text)
            .map((part: any) => part.text);
          rawResponseText = textParts.join('');
        }
      }
      
      console.log('[Gemini Agent] Response received:', {
        hasFunctionCalls: !!(response.functionCalls && response.functionCalls.length > 0),
        functionCallsCount: response.functionCalls?.length || 0,
        hasText: !!rawResponseText,
        textLength: rawResponseText?.length || 0,
        finishReason: finishReason,
        candidates: candidates.length,
      });
      
      // Log first candidate details if available
      if (candidates.length > 0) {
        const firstCandidate = candidates[0];
        console.log('[Gemini Agent] First candidate:', {
          finishReason: firstCandidate.finishReason,
          hasContent: !!(firstCandidate.content),
          contentParts: firstCandidate.content?.parts?.length || 0,
        });
        
        // Log the actual content parts
        if (firstCandidate.content && firstCandidate.content.parts) {
          console.log('[Gemini Agent] Content parts:', firstCandidate.content.parts.map((part: any) => ({
            hasText: !!part.text,
            textLength: part.text?.length || 0,
            hasFunctionCall: !!part.functionCall,
            functionCallName: part.functionCall?.name,
          })));
        }
      }
      
      if (response.functionCalls && response.functionCalls.length > 0) {
        console.log('[Gemini Agent] Function calls:', response.functionCalls.map((fc: any) => ({
          name: fc.name,
          args: fc.args,
        })));
      } else if (context?.tools && context.tools.length > 0) {
        console.log('[Gemini Agent] No function calls made despite tools being available');
        console.log('[Gemini Agent] Finish reason:', finishReason);
        console.log('[Gemini Agent] Available tools:', context.tools.map(t => ({
          name: t.name,
          description: t.description?.substring(0, 100),
        })));
      }

      // Check for function calls - try multiple locations
      const functionCalls: GeminiFunctionCall[] = [];
      let responseText = '';
      let functionResponses: any[] = [];

      // First, try response.functionCalls (standard location)
      const rawFunctionCalls = response.functionCalls;
      const responseFunctionCalls = Array.isArray(rawFunctionCalls) ? rawFunctionCalls : [];
      
      // Also check candidate parts for function calls (alternative location)
      let candidateFunctionCalls: any[] = [];
      if (candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
        candidateFunctionCalls = candidates[0].content.parts
          .filter((part: any) => part.functionCall)
          .map((part: any) => part.functionCall);
      }
      
      // Combine both sources
      const allFunctionCalls = [...responseFunctionCalls, ...candidateFunctionCalls];
      
      console.log('[Gemini Agent] Function call sources:', {
        responseFunctionCalls: responseFunctionCalls.length,
        candidateFunctionCalls: candidateFunctionCalls.length,
        total: allFunctionCalls.length,
      });

      if (allFunctionCalls.length > 0) {
        // Handle function calls
        for (const call of allFunctionCalls) {
          const functionCall: GeminiFunctionCall = {
            name: call.name || call.functionName,
            args: call.args || call.args || {},
          };
          functionCalls.push(functionCall);

          // Execute function if handler is provided
          if (context?.functionCallHandler) {
            try {
              const functionResult = await context.functionCallHandler(functionCall);
              functionResponses.push({
                name: call.name,
                response: functionResult,
              });
            } catch (error) {
              console.error(`Error executing function ${call.name}:`, error);
              functionResponses.push({
                name: call.name,
                response: { error: error instanceof Error ? error.message : 'Unknown error' },
              });
            }
          }
        }

        // If we have function responses, send them back and get final response
        if (functionResponses.length > 0) {
          const functionCallResult = await chat.sendMessage({
            functionResponse: functionResponses,
          });
          responseText = functionCallResult.response.text();
        }
      } else {
        // No function calls, just return the text
        // Use the rawResponseText we already extracted
        responseText = rawResponseText || '';
        
        // If we have tools but no function calls and no text, log a warning
        if (context?.tools && context.tools.length > 0 && (!responseText || responseText.trim() === '')) {
          console.warn('[Gemini Agent] Warning: Tools available but no function calls made and no text returned.');
          console.warn('[Gemini Agent] Available tools:', context.tools.map(t => ({
            name: t.name,
            description: t.description?.substring(0, 100),
            hasParameters: !!t.parameters,
            parameterCount: t.parameters?.properties ? Object.keys(t.parameters.properties).length : 0,
          })));
          console.warn('[Gemini Agent] This might indicate:');
          console.warn('  1. Tool schema format issue');
          console.warn('  2. Gemini not recognizing when to use tools');
          console.warn('  3. Prompt not explicit enough about tool usage');
          console.warn('  4. Finish reason:', finishReason);
          
          // Try to get more info from candidates
          if (candidates.length > 0) {
            const candidate = candidates[0];
            console.warn('[Gemini Agent] Candidate details:', {
              finishReason: candidate.finishReason,
              content: candidate.content,
              safetyRatings: candidate.safetyRatings,
            });
          }
        }
      }

      return {
        text: responseText || '',
        functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
      };
    } catch (error) {
      console.error('Gemini API error:', error);
      throw error;
    }
  }

  /**
   * Generate a streaming response with function calling support
   */
  async *generateStreamingResponse(
    prompt: string,
    context?: {
      tools?: GeminiTool[];
      conversationHistory?: Array<{ role: 'user' | 'model'; content: string }>;
      functionCallHandler?: (call: GeminiFunctionCall) => Promise<any>;
    }
  ): AsyncGenerator<string, void, unknown> {
    if (!this.model) {
      throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY environment variable.');
    }

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

      const result = await chat.sendMessageStream(prompt);
      
      let hasFunctionCalls = false;
      const functionCalls: GeminiFunctionCall[] = [];
      const functionResponses: any[] = [];

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          yield chunkText;
        }

        // Check for function calls
        if (chunk.functionCalls) {
          hasFunctionCalls = true;
          for (const call of chunk.functionCalls) {
            functionCalls.push({
              name: call.name,
              args: call.args || {},
            });
          }
        }
      }

      // Handle function calls after streaming completes
      if (hasFunctionCalls && context?.functionCallHandler) {
        for (const call of functionCalls) {
          try {
            const functionResult = await context.functionCallHandler(call);
            functionResponses.push({
              name: call.name,
              response: functionResult,
            });
          } catch (error) {
            console.error(`Error executing function ${call.name}:`, error);
            functionResponses.push({
              name: call.name,
              response: { error: error instanceof Error ? error.message : 'Unknown error' },
            });
          }
        }

        // Stream the final response after function calls
        if (functionResponses.length > 0) {
          const finalResult = await chat.sendMessageStream({
            functionResponse: functionResponses,
          });
          
          for await (const chunk of finalResult.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
              yield chunkText;
            }
          }
        }
      }
    } catch (error) {
      console.error('Gemini streaming error:', error);
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


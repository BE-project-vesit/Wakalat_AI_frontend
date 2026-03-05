// API Route for Gemini Streaming Chat with MCP Integration
import { NextRequest } from 'next/server';
import { getGeminiAgent } from '@/lib/gemini-agent';
import { runLegalAssistant } from '@/lib/legal-assistant';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversationHistory, useMCPTools = true } = body;

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const geminiAgent = getGeminiAgent();

    if (!geminiAgent.isConfigured()) {
      return new Response(
        JSON.stringify({ error: 'Gemini API key not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Stream API] Calling runLegalAssistant with:', { message, useMCPTools });
    const result = await runLegalAssistant({
      message,
      conversationHistory: conversationHistory || [],
      useMCPTools,
    });

    console.log('[Stream API] Result received:', {
      hasFinalText: !!result.finalText,
      finalTextLength: result.finalText?.length || 0,
      toolCallsCount: result.toolCalls?.length || 0,
    });

    // Handle empty or error responses
    if (!result.finalText || result.finalText.trim() === '' || result.finalText === 'No response generated.') {
      const errorMsg = 'No response generated. This might be due to:\n' +
        '1. MCP server not connected\n' +
        '2. Tool execution error\n' +
        '3. Gemini API issue\n\n' +
        'Please check the server logs for more details.';
      
      return new Response(
        errorMsg,
        { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        // Split by double newlines for better streaming, but handle empty text
        const textToStream = result.finalText || 'No response available.';
        const chunks = textToStream.split(/\n{2,}/).filter(Boolean);

        (async () => {
          try {
            if (!chunks.length) {
              controller.enqueue(encoder.encode(textToStream));
            } else {
              for (const chunk of chunks) {
                controller.enqueue(encoder.encode(`${chunk}\n\n`));
                await new Promise((resolve) => setTimeout(resolve, 20));
              }
            }
          } catch (streamError) {
            console.error('[Stream API] Error in stream:', streamError);
            controller.enqueue(encoder.encode('\n\nError streaming response.'));
          } finally {
            controller.close();
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('[Stream API] Gemini streaming error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Stream API] Error stack:', error instanceof Error ? error.stack : 'No stack');
    
    return new Response(
      `Error: ${errorMessage}\n\nPlease check:\n1. MCP server connection status\n2. Gemini API key configuration\n3. Server logs for detailed error information`,
      { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }
}


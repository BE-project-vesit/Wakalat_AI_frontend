// API Route for Gemini Streaming Chat with MCP Integration
import { NextRequest } from 'next/server';
import { getGeminiAgent } from '@/lib/gemini-agent';
import { runLegalAssistant, StreamEvent } from '@/lib/legal-assistant';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversationHistory, useMCPTools = true, maxToolIterations, attachments } = body;

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

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        const sendSSE = (event: string, data: any) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        (async () => {
          try {
            console.log('[Stream API] Calling runLegalAssistant with:', { message, useMCPTools });

            const result = await runLegalAssistant({
              message,
              conversationHistory: conversationHistory || [],
              useMCPTools,
              maxToolIterations,
              attachments,
              onEvent: (event: StreamEvent) => {
                sendSSE(event.type, event.data);
              },
            });

            console.log('[Stream API] Result received:', {
              hasFinalText: !!result.finalText,
              finalTextLength: result.finalText?.length || 0,
              toolCallsCount: result.toolCalls?.length || 0,
            });

            // Handle empty responses
            const textToStream = (!result.finalText || result.finalText.trim() === '' || result.finalText === 'No response generated.')
              ? 'No response generated. Please check the MCP server connection and try again.'
              : result.finalText;

            // Stream the final text in chunks
            const chunks = textToStream.split(/\n{2,}/).filter(Boolean);
            if (!chunks.length) {
              sendSSE('text', { content: textToStream });
            } else {
              for (const chunk of chunks) {
                sendSSE('text', { content: `${chunk}\n\n` });
                await new Promise((resolve) => setTimeout(resolve, 20));
              }
            }

            sendSSE('done', {});
          } catch (error) {
            console.error('[Stream API] Gemini streaming error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            sendSSE('error', { error: errorMessage });
          } finally {
            controller.close();
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[Stream API] Gemini streaming error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      `Error: ${errorMessage}\n\nPlease check:\n1. MCP server connection status\n2. Gemini API key configuration\n3. Server logs for detailed error information`,
      { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }
}

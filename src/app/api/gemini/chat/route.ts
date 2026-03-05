// API Route for Gemini Chat with MCP Integration
import { NextRequest, NextResponse } from 'next/server';
import { getGeminiAgent } from '@/lib/gemini-agent';
import { runLegalAssistant } from '@/lib/legal-assistant';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversationHistory, useMCPTools = true } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const geminiAgent = getGeminiAgent();

    if (!geminiAgent.isConfigured()) {
      return NextResponse.json(
        { error: 'Gemini API key not configured' },
        { status: 500 }
      );
    }

    const result = await runLegalAssistant({
      message,
      conversationHistory: conversationHistory || [],
      useMCPTools,
    });

    return NextResponse.json({
      success: true,
      response: result.finalText,
      toolCalls: result.toolCalls,
    });
  } catch (error) {
    console.error('Gemini chat error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Gemini chat endpoint. Use POST to send messages.',
    configured: getGeminiAgent().isConfigured(),
  });
}


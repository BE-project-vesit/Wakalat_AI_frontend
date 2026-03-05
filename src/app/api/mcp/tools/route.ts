// API Route for MCP Tool Operations
import { NextRequest, NextResponse } from 'next/server';
import { getMCPClientManager } from '@/lib/mcp-client';

export async function GET() {
  try {
    const mcpManager = getMCPClientManager();
    
    // Get connection status for better error reporting
    const status = mcpManager.getStatus();
    
    if (!mcpManager.isConnected()) {
      console.error('[MCP Tools API] Not connected. Status:', JSON.stringify(status, null, 2));
      return NextResponse.json(
        { 
          success: false,
          error: 'MCP client not connected',
          status: status,
        },
        { status: 400 }
      );
    }

    console.log('[MCP Tools API] Fetching tools...');
    const tools = await mcpManager.listTools();
    console.log(`[MCP Tools API] Successfully retrieved ${Array.isArray(tools) ? tools.length : 0} tools`);
    
    return NextResponse.json({ 
      success: true, 
      tools: Array.isArray(tools) ? tools : [],
      toolCount: Array.isArray(tools) ? tools.length : 0,
    });
  } catch (error) {
    console.error('[MCP Tools API] Error listing tools:', error);
    console.error('[MCP Tools API] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { toolName, args } = body;

    if (!toolName) {
      return NextResponse.json(
        { error: 'Tool name is required' },
        { status: 400 }
      );
    }

    const mcpManager = getMCPClientManager();
    
    if (!mcpManager.isConnected()) {
      return NextResponse.json(
        { error: 'MCP client not connected' },
        { status: 400 }
      );
    }

    const result = await mcpManager.callTool(toolName, args || {});
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Error calling tool:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}


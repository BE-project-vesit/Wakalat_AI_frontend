// API Route for MCP Connection Management
import { NextRequest, NextResponse } from 'next/server';
import { getMCPClientManager, MCPConnectionConfig } from '@/lib/mcp-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, config } = body;

    const mcpManager = getMCPClientManager();

    if (action === 'connect') {
      if (!config) {
        return NextResponse.json(
          { error: 'Config is required' },
          { status: 400 }
        );
      }

      const mcpConfig: MCPConnectionConfig = {
        command: config.command || 'uv',
        args: config.args || ['run', 'main.py'],
        cwd: config.cwd || 'F:/code n shit/Wakalat/Wakalat-AI-Backend',
      };

      const status = await mcpManager.connect(mcpConfig);
      
      // Verify the connection by checking status
      const verifyStatus = mcpManager.getStatus();
      console.log('[MCP Connect API] Connection result:', {
        returnedStatus: status,
        verifiedStatus: verifyStatus,
        isConnected: mcpManager.isConnected(),
      });
      
      // Try to list tools immediately to verify connection works
      if (status.connected) {
        try {
          const tools = await mcpManager.listTools();
          console.log(`[MCP Connect API] Successfully listed ${Array.isArray(tools) ? tools.length : 0} tools after connection`);
        } catch (toolError) {
          console.error('[MCP Connect API] Warning: Could not list tools immediately after connection:', toolError);
        }
      }
      
      return NextResponse.json({ success: true, status: verifyStatus });
    } else if (action === 'disconnect') {
      await mcpManager.disconnect();
      return NextResponse.json({ success: true, status: { connected: false } });
    } else if (action === 'status') {
      const status = mcpManager.getStatus();
      return NextResponse.json({ success: true, status });
    } else {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('MCP API error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const mcpManager = getMCPClientManager();
    const status = mcpManager.getStatus();
    return NextResponse.json({ success: true, status });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}


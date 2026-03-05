import { NextRequest, NextResponse } from 'next/server';
import { getMCPClientManager } from '@/lib/mcp-client';
import type { MCPServerConfig } from '@/lib/mcp-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, serverName, serverConfig, config } = body;

    const mcpManager = getMCPClientManager();

    if (action === 'connect') {
      // New path: connect by server name + config from mcp.json
      if (serverName && serverConfig) {
        const status = await mcpManager.connectServer(serverName, serverConfig as MCPServerConfig);
        return NextResponse.json({ success: true, status });
      }

      // Legacy path: connect with command/args/cwd
      if (config) {
        const status = await mcpManager.connect({
          command: config.command || 'uv',
          args: config.args || ['run', 'main.py'],
          cwd: config.cwd || '',
        });
        return NextResponse.json({ success: true, status });
      }

      return NextResponse.json({ error: 'Config is required' }, { status: 400 });
    } else if (action === 'disconnect') {
      await mcpManager.disconnect();
      return NextResponse.json({ success: true, status: { connected: false } });
    } else if (action === 'status') {
      const status = mcpManager.getStatus();
      return NextResponse.json({ success: true, status });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('MCP API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const mcpManager = getMCPClientManager();
    const status = mcpManager.getStatus();
    const activeServer = mcpManager.getActiveServerName();
    return NextResponse.json({ success: true, status, activeServer });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const MCP_CONFIG_PATH = path.join(process.cwd(), 'mcp.json');

export interface MCPServerConfig {
  type: 'sse' | 'stdio';
  // SSE fields
  url?: string;
  headers?: Record<string, string>;
  // Stdio fields
  command?: string;
  args?: string[];
  cwd?: string;
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

async function readConfig(): Promise<MCPConfig> {
  try {
    const raw = await fs.readFile(MCP_CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { mcpServers: {} };
  }
}

async function writeConfig(config: MCPConfig): Promise<void> {
  await fs.writeFile(MCP_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export async function GET() {
  try {
    const config = await readConfig();
    return NextResponse.json({ success: true, config });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to read config' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { config } = body as { config: MCPConfig };

    if (!config || !config.mcpServers) {
      return NextResponse.json(
        { success: false, error: 'Invalid config format. Expected { mcpServers: { ... } }' },
        { status: 400 }
      );
    }

    await writeConfig(config);
    return NextResponse.json({ success: true, config });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to write config' },
      { status: 500 }
    );
  }
}

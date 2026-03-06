// MCP Client Service - Server-side only
// Supports both stdio (local) and SSE (remote) transports

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

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

export interface MCPConnectionStatus {
  connected: boolean;
  error?: string;
  serverInfo?: {
    name: string;
    version: string;
  };
}

// Legacy config type for backward compatibility
export interface MCPConnectionConfig {
  command: string;
  args: string[];
  cwd: string;
}

class MCPClientManager {
  private client: Client | null = null;
  private transport: StdioClientTransport | SSEClientTransport | null = null;
  private connectionStatus: MCPConnectionStatus = { connected: false };
  private activeServerName: string | null = null;

  /**
   * Connect using a named server config from mcp.json
   */
  async connectServer(name: string, config: MCPServerConfig): Promise<MCPConnectionStatus> {
    try {
      await this.disconnect();
      this.activeServerName = name;

      const client = new Client(
        { name: 'wakalat-ai-frontend', version: '1.0.0' },
        { capabilities: { tools: {} } }
      );

      let transport: StdioClientTransport | SSEClientTransport;

      if (config.type === 'sse') {
        if (!config.url) {
          throw new Error('SSE config requires a url. Please set the SSE URL in the server config.');
        }
        const authHeader = config.headers?.Authorization;
        if (!authHeader || authHeader === 'Bearer ' || authHeader === 'Bearer <your-token-here>') {
          throw new Error('SSE config requires a valid Authorization token. Generate one in the MCP connection panel.');
        }
        const headers = config.headers || {};
        transport = new SSEClientTransport(new URL(config.url), {
          eventSourceInit: {
            headers: headers,
          } as any,
          requestInit: {
            headers: headers,
          },
        });
      } else {
        // stdio transport
        const command = config.command || 'uv';
        const args = config.args || ['run', 'main.py'];
        const cwd = config.cwd;

        let finalCommand = command;
        let finalArgs = args;

        if (cwd && process.platform === 'win32') {
          finalCommand = 'cmd.exe';
          finalArgs = ['/c', 'cd', '/d', cwd, '&&', command, ...args];
        } else if (cwd && process.platform !== 'win32') {
          finalCommand = 'sh';
          finalArgs = ['-c', `cd "${cwd}" && ${command} ${args.join(' ')}`];
        }

        transport = new StdioClientTransport({
          command: finalCommand,
          args: finalArgs,
          env: process.env as Record<string, string>,
        });
      }

      await client.connect(transport);

      this.client = client;
      this.transport = transport;

      // Verify by listing tools
      try {
        const toolsResponse = await client.listTools();
        console.log(`[MCP Client] Connected to "${name}" - tools available`);
      } catch (verifyError) {
        console.warn(`[MCP Client] Connected to "${name}" but could not verify tools:`, verifyError);
      }

      this.connectionStatus = {
        connected: true,
        serverInfo: { name, version: '1.0.0' },
      };
      return this.connectionStatus;
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : (typeof error === 'string' ? error : `Connection failed: ${JSON.stringify(error)}`);
      console.error(`[MCP Client] Failed to connect to "${name}":`, error);
      this.connectionStatus = { connected: false, error: errorMessage };
      return this.connectionStatus;
    }
  }

  /**
   * Legacy connect method (stdio only) for backward compatibility
   */
  async connect(config: MCPConnectionConfig): Promise<MCPConnectionStatus> {
    return this.connectServer('legacy', {
      type: 'stdio',
      command: config.command,
      args: config.args,
      cwd: config.cwd,
    });
  }

  async disconnect(): Promise<void> {
    try {
      if (this.transport) {
        await this.transport.close();
        this.transport = null;
      }
      if (this.client) {
        await this.client.close();
        this.client = null;
      }
      this.connectionStatus = { connected: false };
      this.activeServerName = null;
    } catch (error) {
      console.error('Error disconnecting MCP client:', error);
    }
  }

  getStatus(): MCPConnectionStatus {
    return { ...this.connectionStatus };
  }

  getActiveServerName(): string | null {
    return this.activeServerName;
  }

  async callTool(toolName: string, args: Record<string, any>, timeoutMs = 120_000): Promise<any> {
    if (!this.client || !this.connectionStatus.connected) {
      throw new Error('MCP client not connected');
    }
    return this.client.callTool({ name: toolName, arguments: args }, undefined, {
      timeout: timeoutMs,
    });
  }

  async listTools(): Promise<any[]> {
    if (!this.client || !this.connectionStatus.connected) {
      throw new Error('MCP client not connected');
    }

    const toolsResponse = await this.client.listTools();
    if (Array.isArray(toolsResponse)) return toolsResponse;
    if (toolsResponse && typeof toolsResponse === 'object') {
      if ('tools' in toolsResponse && Array.isArray(toolsResponse.tools)) {
        return toolsResponse.tools;
      }
    }
    return [];
  }

  getClient(): Client | null {
    return this.client;
  }

  isConnected(): boolean {
    return this.connectionStatus.connected && this.client !== null;
  }
}

// Singleton instance via globalThis to survive Next.js dev hot reloads
const globalForMCP = globalThis as typeof globalThis & {
  __mcpClientManager?: MCPClientManager;
};

export function getMCPClientManager(): MCPClientManager {
  if (!globalForMCP.__mcpClientManager) {
    globalForMCP.__mcpClientManager = new MCPClientManager();
  }
  return globalForMCP.__mcpClientManager;
}

export default getMCPClientManager();

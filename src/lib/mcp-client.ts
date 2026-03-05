// MCP Client Service - Server-side only
// This handles the connection to the MCP server

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface MCPConnectionConfig {
  command: string;
  args: string[];
  cwd: string;
}

export interface MCPConnectionStatus {
  connected: boolean;
  error?: string;
  serverInfo?: {
    name: string;
    version: string;
  };
}

class MCPClientManager {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connectionStatus: MCPConnectionStatus = { connected: false };
  private config: MCPConnectionConfig | null = null;

  /**
   * Initialize and connect to the MCP server
   */
  async connect(config: MCPConnectionConfig): Promise<MCPConnectionStatus> {
    try {
      // Disconnect existing connection if any
      await this.disconnect();

      this.config = config;
      const client = new Client(
        {
          name: 'wakalat-ai-frontend',
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );

      // Create transport - it will handle spawning the process
      // Note: StdioClientTransport handles process spawning internally
      // For Windows, we need to handle cwd via shell command if needed
      let command = config.command;
      let args = config.args;
      
      // If cwd is specified and we're on Windows, wrap the command
      if (config.cwd && process.platform === 'win32') {
        // Use cmd.exe to change directory and run command
        command = 'cmd.exe';
        args = ['/c', 'cd', '/d', config.cwd, '&&', config.command, ...config.args];
      } else if (config.cwd && process.platform !== 'win32') {
        // For Unix-like systems, use sh
        command = 'sh';
        args = ['-c', `cd "${config.cwd}" && ${config.command} ${config.args.join(' ')}`];
      }
      
      const transport = new StdioClientTransport({
        command: command,
        args: args,
        env: process.env as Record<string, string>,
      });

      // Connect the client to the transport
      // According to MCP SDK, client.connect() accepts the transport
      await client.connect(transport);

      // Initialize the connection - this should trigger the MCP handshake
      // The server should send its capabilities during initialization
      
      this.client = client;
      this.transport = transport;

      // Verify connection by trying to list tools
      try {
        const toolsResponse = await client.listTools();
        console.log('[MCP Client] Connection verified - tools available:', Array.isArray(toolsResponse) ? toolsResponse.length : 'unknown');
      } catch (verifyError) {
        console.warn('[MCP Client] Warning: Could not verify connection by listing tools:', verifyError);
        // Don't fail the connection if tools can't be listed yet
      }

      this.connectionStatus = {
        connected: true,
        serverInfo: {
          name: 'wakalat-ai',
          version: '1.0.0',
        },
      };

      return this.connectionStatus;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.connectionStatus = {
        connected: false,
        error: errorMessage,
      };
      return this.connectionStatus;
    }
  }

  /**
   * Disconnect from the MCP server
   */
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
    } catch (error) {
      console.error('Error disconnecting MCP client:', error);
    }
  }

  /**
   * Get current connection status
   */
  getStatus(): MCPConnectionStatus {
    return { ...this.connectionStatus };
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(toolName: string, args: Record<string, any>): Promise<any> {
    if (!this.client || !this.connectionStatus.connected) {
      throw new Error('MCP client not connected');
    }

    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: args,
      });

      return result;
    } catch (error) {
      console.error(`Error calling tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<any[]> {
    console.log('[MCP Client] listTools() called');
    console.log('[MCP Client] Connection status:', {
      hasClient: !!this.client,
      connected: this.connectionStatus.connected,
      status: this.connectionStatus,
    });

    if (!this.client || !this.connectionStatus.connected) {
      const errorMsg = !this.client ? 'MCP client is null' : 'MCP client not connected';
      console.error(`[MCP Client] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    try {
      console.log('[MCP Client] Calling client.listTools()...');
      const toolsResponse = await this.client.listTools();
      console.log('[MCP Client] Raw listTools response type:', typeof toolsResponse);
      console.log('[MCP Client] Raw listTools response:', JSON.stringify(toolsResponse, null, 2));
      
      // Handle different response structures
      let toolsArray: any[] = [];
      
      // Check if it's already an array
      if (Array.isArray(toolsResponse)) {
        toolsArray = toolsResponse;
        console.log('[MCP Client] Response is already an array');
      } else if (toolsResponse && typeof toolsResponse === 'object') {
        // Check for common MCP SDK response structures
        if ('tools' in toolsResponse && Array.isArray(toolsResponse.tools)) {
          toolsArray = toolsResponse.tools;
          console.log('[MCP Client] Found tools in response.tools');
        } else if ('result' in toolsResponse) {
          if (Array.isArray(toolsResponse.result)) {
            toolsArray = toolsResponse.result;
            console.log('[MCP Client] Found tools in response.result (array)');
          } else if (toolsResponse.result && typeof toolsResponse.result === 'object' && 'tools' in toolsResponse.result) {
            toolsArray = Array.isArray(toolsResponse.result.tools) ? toolsResponse.result.tools : [];
            console.log('[MCP Client] Found tools in response.result.tools');
          }
        } else {
          // Try to find any array property
          const keys = Object.keys(toolsResponse);
          console.log('[MCP Client] Searching for array property in keys:', keys);
          for (const key of keys) {
            if (Array.isArray(toolsResponse[key])) {
              toolsArray = toolsResponse[key];
              console.log(`[MCP Client] Found array in property: ${key}`);
              break;
            }
          }
        }
      }
      
      console.log(`[MCP Client] Extracted ${toolsArray.length} tools`);
      if (toolsArray.length > 0) {
        console.log('[MCP Client] Tool names:', toolsArray.map((t: any) => t.name || 'unnamed').join(', '));
      }
      return toolsArray;
    } catch (error) {
      console.error('[MCP Client] Error listing tools:', error);
      console.error('[MCP Client] Error details:', error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : error);
      throw error;
    }
  }

  /**
   * Get the client instance (for advanced usage)
   */
  getClient(): Client | null {
    return this.client;
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    const isConnected = this.connectionStatus.connected && this.client !== null;
    console.log('[MCP Client] isConnected() check:', {
      connectionStatus: this.connectionStatus.connected,
      hasClient: !!this.client,
      hasTransport: !!this.transport,
      result: isConnected,
    });
    return isConnected;
  }

  /**
   * Verify connection is still alive by checking if client exists and transport is active
   */
  async verifyConnection(): Promise<boolean> {
    if (!this.client || !this.connectionStatus.connected) {
      return false;
    }
    
    try {
      // Try to list tools as a way to verify connection
      await this.client.listTools();
      return true;
    } catch (error) {
      console.warn('[MCP Client] Connection verification failed:', error);
      // Mark as disconnected if verification fails
      this.connectionStatus = { connected: false };
      return false;
    }
  }
}

// Singleton instance
let mcpClientManager: MCPClientManager | null = null;

export function getMCPClientManager(): MCPClientManager {
  if (!mcpClientManager) {
    mcpClientManager = new MCPClientManager();
  }
  return mcpClientManager;
}

export default getMCPClientManager();


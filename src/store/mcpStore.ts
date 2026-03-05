// MCP Connection Store
import { create } from 'zustand';

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: any;
}

export interface MCPConnectionStatus {
  connected: boolean;
  error?: string;
  serverInfo?: {
    name: string;
    version: string;
  };
  connecting?: boolean;
}

interface MCPStore {
  status: MCPConnectionStatus;
  tools: MCPTool[];
  loadingTools: boolean;
  config: {
    command: string;
    args: string[];
    cwd: string;
  };
  setStatus: (status: MCPConnectionStatus) => void;
  setConfig: (config: { command: string; args: string[]; cwd: string }) => void;
  connect: () => Promise<MCPConnectionStatus>;
  disconnect: () => Promise<void>;
  checkStatus: () => Promise<void>;
  fetchTools: () => Promise<void>;
}

const defaultConfig = {
  command: 'uv',
  args: ['run', 'main.py'],
  cwd: 'F:/code n shit/Wakalat/Wakalat-AI-Backend',
};

export const useMCPStore = create<MCPStore>((set, get) => ({
  status: {
    connected: false,
    connecting: false,
  },
  tools: [],
  loadingTools: false,
  config: defaultConfig,

  setStatus: (status) => set({ status }),

  setConfig: (config) => set({ config }),

  connect: async () => {
    set({ status: { ...get().status, connecting: true } });
    try {
      const response = await fetch('/api/mcp/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'connect',
          config: get().config,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        const connectionStatus = { ...data.status, connecting: false };
        set({ status: connectionStatus });
        // Automatically fetch tools after successful connection
        if (data.status.connected) {
          await get().fetchTools();
        }
        return connectionStatus;
      } else {
        const errorStatus = {
          connected: false,
          error: data.error || 'Failed to connect',
          connecting: false,
        };
        set({ status: errorStatus });
        return errorStatus;
      }
    } catch (error) {
      const errorStatus = {
        connected: false,
        error: error instanceof Error ? error.message : 'Connection failed',
        connecting: false,
      };
      set({ status: errorStatus });
      return errorStatus;
    }
  },

  disconnect: async () => {
    try {
      const response = await fetch('/api/mcp/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'disconnect',
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        set({ status: { connected: false, connecting: false }, tools: [] });
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  },

  checkStatus: async () => {
    try {
      const response = await fetch('/api/mcp/connect', {
        method: 'GET',
      });

      const data = await response.json();
      
      if (data.success) {
        set({ status: { ...data.status, connecting: false } });
        // Fetch tools if connected
        if (data.status.connected) {
          await get().fetchTools();
        }
      }
    } catch (error) {
      console.error('Error checking status:', error);
    }
  },

  fetchTools: async () => {
    set({ loadingTools: true });
    try {
      const response = await fetch('/api/mcp/tools', {
        method: 'GET',
      });

      const data = await response.json();
      
      if (data.success && Array.isArray(data.tools)) {
        const tools: MCPTool[] = data.tools.map((tool: any) => ({
          name: tool.name || 'Unknown Tool',
          description: tool.description,
          inputSchema: tool.inputSchema || tool.input_schema,
        }));
        set({ tools, loadingTools: false });
      } else {
        set({ tools: [], loadingTools: false });
      }
    } catch (error) {
      console.error('Error fetching tools:', error);
      set({ tools: [], loadingTools: false });
    }
  },
}));


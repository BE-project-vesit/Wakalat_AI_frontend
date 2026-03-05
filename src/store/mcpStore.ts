import { create } from 'zustand';

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: any;
}

export interface MCPServerConfig {
  type: 'sse' | 'stdio';
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  cwd?: string;
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
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
  mcpConfig: MCPConfig;
  activeServer: string | null;
  configLoaded: boolean;

  setStatus: (status: MCPConnectionStatus) => void;
  loadConfig: () => Promise<void>;
  saveConfig: (config: MCPConfig) => Promise<void>;
  addServer: (name: string, config: MCPServerConfig) => Promise<void>;
  updateServer: (name: string, config: MCPServerConfig) => Promise<void>;
  removeServer: (name: string) => Promise<void>;
  connectServer: (name: string) => Promise<MCPConnectionStatus>;
  disconnect: () => Promise<void>;
  checkStatus: () => Promise<void>;
  fetchTools: () => Promise<void>;
}

export const useMCPStore = create<MCPStore>((set, get) => ({
  status: { connected: false, connecting: false },
  tools: [],
  loadingTools: false,
  mcpConfig: { mcpServers: {} },
  activeServer: null,
  configLoaded: false,

  setStatus: (status) => set({ status }),

  loadConfig: async () => {
    try {
      const response = await fetch('/api/mcp/config');
      const data = await response.json();
      if (data.success) {
        set({ mcpConfig: data.config, configLoaded: true });
      }
    } catch (error) {
      console.error('Error loading MCP config:', error);
    }
  },

  saveConfig: async (config) => {
    try {
      const response = await fetch('/api/mcp/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const data = await response.json();
      if (data.success) {
        set({ mcpConfig: config });
      }
    } catch (error) {
      console.error('Error saving MCP config:', error);
    }
  },

  addServer: async (name, config) => {
    const current = get().mcpConfig;
    const updated = {
      mcpServers: { ...current.mcpServers, [name]: config },
    };
    await get().saveConfig(updated);
  },

  updateServer: async (name, config) => {
    const current = get().mcpConfig;
    const updated = {
      mcpServers: { ...current.mcpServers, [name]: config },
    };
    await get().saveConfig(updated);
  },

  removeServer: async (name) => {
    const current = get().mcpConfig;
    const { [name]: _, ...rest } = current.mcpServers;
    await get().saveConfig({ mcpServers: rest });
    if (get().activeServer === name) {
      await get().disconnect();
    }
  },

  connectServer: async (name) => {
    const config = get().mcpConfig.mcpServers[name];
    if (!config) {
      const errorStatus: MCPConnectionStatus = {
        connected: false,
        error: `Server "${name}" not found in config`,
        connecting: false,
      };
      set({ status: errorStatus });
      return errorStatus;
    }

    set({ status: { ...get().status, connecting: true } });

    try {
      const response = await fetch('/api/mcp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect', serverName: name, serverConfig: config }),
      });

      const data = await response.json();

      if (data.success && data.status?.connected) {
        const connectionStatus: MCPConnectionStatus = { ...data.status, connecting: false };
        set({ status: connectionStatus, activeServer: name });
        await get().fetchTools();
        return connectionStatus;
      } else {
        const errorStatus: MCPConnectionStatus = {
          connected: false,
          error: data.error || data.status?.error || 'Failed to connect',
          connecting: false,
        };
        set({ status: errorStatus });
        return errorStatus;
      }
    } catch (error) {
      const errorStatus: MCPConnectionStatus = {
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
      await fetch('/api/mcp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      set({ status: { connected: false, connecting: false }, tools: [], activeServer: null });
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  },

  checkStatus: async () => {
    try {
      const response = await fetch('/api/mcp/connect', { method: 'GET' });
      const data = await response.json();
      if (data.success) {
        set({
          status: { ...data.status, connecting: false },
          activeServer: data.activeServer || get().activeServer,
        });
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
      const response = await fetch('/api/mcp/tools');
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

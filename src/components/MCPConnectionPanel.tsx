'use client';

import React, { useEffect, useState } from 'react';
import { useMCPStore } from '@/store/mcpStore';
import { Settings, Wifi, WifiOff, Loader2, CheckCircle2, XCircle, Wrench } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

const MCPConnectionPanel: React.FC = () => {
  const { status, tools, loadingTools, config, setConfig, connect, disconnect, checkStatus, fetchTools } = useMCPStore();
  const [isOpen, setIsOpen] = useState(false);
  const [localConfig, setLocalConfig] = useState(config);

  useEffect(() => {
    // Check connection status on mount
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    // Fetch tools when connection status changes to connected
    if (status.connected && tools.length === 0 && !loadingTools) {
      fetchTools();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.connected]);

  const handleConnect = async () => {
    setConfig(localConfig);
    const connectionStatus = await connect();
    if (connectionStatus.connected) {
      toast.success('MCP server connected successfully');
      setIsOpen(false);
    } else {
      toast.error(connectionStatus.error || 'Failed to connect to MCP server');
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    toast.success('Disconnected from MCP server');
  };

  const getStatusIcon = () => {
    if (status.connecting) {
      return <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />;
    }
    if (status.connected) {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
    return <XCircle className="w-4 h-4 text-red-500" />;
  };

  const getStatusText = () => {
    if (status.connecting) return 'Connecting...';
    if (status.connected) return 'Connected';
    return 'Disconnected';
  };

  return (
    <>
      {/* Connection Status Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2 bg-stone-700 dark:bg-zinc-800 text-white rounded-lg shadow-lg hover:bg-stone-600 dark:hover:bg-zinc-700 transition-colors"
        title="MCP Connection Status"
      >
        {getStatusIcon()}
        <span className="text-sm font-medium">{getStatusText()}</span>
        <Settings className="w-4 h-4" />
      </button>

      {/* Connection Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/50 z-40"
            />
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-20 right-4 z-50 w-96 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-stone-200 dark:border-zinc-700 p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-stone-800 dark:text-stone-200">
                  MCP Connection
                </h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {/* Status Display */}
              <div className="mb-4 p-3 bg-stone-50 dark:bg-zinc-900 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  {getStatusIcon()}
                  <span className="text-sm font-medium text-stone-700 dark:text-stone-300">
                    {getStatusText()}
                  </span>
                </div>
                {status.error && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {status.error}
                  </p>
                )}
                {status.serverInfo && (
                  <p className="text-xs text-stone-600 dark:text-stone-400 mt-1">
                    Server: {status.serverInfo.name} v{status.serverInfo.version}
                  </p>
                )}
              </div>

              {/* Available Tools Display */}
              {status.connected && (
                <div className="mb-4 p-3 bg-stone-50 dark:bg-zinc-900 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Wrench className="w-4 h-4 text-stone-600 dark:text-stone-400" />
                    <span className="text-sm font-medium text-stone-700 dark:text-stone-300">
                      Available Tools
                    </span>
                    {loadingTools && (
                      <Loader2 className="w-3 h-3 animate-spin text-stone-500" />
                    )}
                  </div>
                  {loadingTools ? (
                    <p className="text-xs text-stone-600 dark:text-stone-400">
                      Loading tools...
                    </p>
                  ) : tools.length > 0 ? (
                    <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                      {tools.map((tool, index) => (
                        <div
                          key={index}
                          className="p-2 bg-white dark:bg-zinc-800 rounded border border-stone-200 dark:border-zinc-700"
                        >
                          <div className="font-medium text-xs text-stone-800 dark:text-stone-200 mb-1">
                            {tool.name}
                          </div>
                          {tool.description && (
                            <div className="text-xs text-stone-600 dark:text-stone-400">
                              {tool.description}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-600 dark:text-stone-400">
                      No tools available
                    </p>
                  )}
                </div>
              )}

              {/* Configuration */}
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Command
                  </label>
                  <input
                    type="text"
                    value={localConfig.command}
                    onChange={(e) =>
                      setLocalConfig({ ...localConfig, command: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded-md text-stone-800 dark:text-stone-200"
                    placeholder="uv"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Args (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={localConfig.args.join(', ')}
                    onChange={(e) =>
                      setLocalConfig({
                        ...localConfig,
                        args: e.target.value.split(',').map((s) => s.trim()),
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded-md text-stone-800 dark:text-stone-200"
                    placeholder="run, main.py"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Working Directory
                  </label>
                  <input
                    type="text"
                    value={localConfig.cwd}
                    onChange={(e) =>
                      setLocalConfig({ ...localConfig, cwd: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded-md text-stone-800 dark:text-stone-200"
                    placeholder="F:/code n shit/Wakalat-AI-Backend"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {status.connected ? (
                  <button
                    onClick={handleDisconnect}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors"
                  >
                    <WifiOff className="w-4 h-4" />
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={handleConnect}
                    disabled={status.connecting}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {status.connecting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Wifi className="w-4 h-4" />
                        Connect
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={checkStatus}
                  className="px-4 py-2 bg-stone-200 dark:bg-zinc-700 hover:bg-stone-300 dark:hover:bg-zinc-600 text-stone-800 dark:text-stone-200 rounded-md text-sm font-medium transition-colors"
                >
                  Refresh
                </button>
                {status.connected && (
                  <button
                    onClick={fetchTools}
                    disabled={loadingTools}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Refresh tools list"
                  >
                    {loadingTools ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wrench className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default MCPConnectionPanel;


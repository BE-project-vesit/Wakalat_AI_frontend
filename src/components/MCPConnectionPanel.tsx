'use client';

import React, { useEffect, useState } from 'react';
import { useMCPStore, MCPServerConfig } from '@/store/mcpStore';
import { Settings, Wifi, WifiOff, Loader2, CheckCircle2, XCircle, Wrench, Plus, Trash2, Edit3, Save, X, Globe, Terminal, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

type EditingServer = {
  name: string;
  config: MCPServerConfig;
  isNew: boolean;
};

const MCPConnectionPanel: React.FC = () => {
  const {
    status, tools, loadingTools, mcpConfig, activeServer, configLoaded,
    loadConfig, saveConfig, connectServer, disconnect, checkStatus, fetchTools,
    addServer, updateServer, removeServer,
  } = useMCPStore();

  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<EditingServer | null>(null);
  const [newServerName, setNewServerName] = useState('');
  const [tokenEmail, setTokenEmail] = useState('');
  const [generatingToken, setGeneratingToken] = useState(false);
  const [rawConfigText, setRawConfigText] = useState('');
  const [editingRawConfig, setEditingRawConfig] = useState(false);
  const [rawConfigError, setRawConfigError] = useState('');

  useEffect(() => {
    loadConfig();
    checkStatus();
  }, [loadConfig, checkStatus]);

  const handleConnect = async (name: string) => {
    const result = await connectServer(name);
    if (result.connected) {
      toast.success(`Connected to "${name}"`);
    } else {
      toast.error(result.error || 'Failed to connect');
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    toast.success('Disconnected');
  };

  const handleSaveServer = async () => {
    if (!editing) return;
    const name = editing.isNew ? newServerName.trim() : editing.name;
    if (!name) {
      toast.error('Server name is required');
      return;
    }
    if (editing.isNew) {
      await addServer(name, editing.config);
      toast.success(`Added server "${name}"`);
    } else {
      await updateServer(name, editing.config);
      toast.success(`Updated server "${name}"`);
    }
    setEditing(null);
    setNewServerName('');
  };

  const handleDeleteServer = async (name: string) => {
    await removeServer(name);
    toast.success(`Removed server "${name}"`);
  };

  const handleGenerateToken = async () => {
    if (!editing || !tokenEmail.trim()) {
      toast.error('Enter your email to generate a token');
      return;
    }
    const serverUrl = editing.config.url;
    if (!serverUrl) {
      toast.error('Enter the SSE URL first');
      return;
    }

    setGeneratingToken(true);
    try {
      const res = await fetch('/api/mcp/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: tokenEmail.trim(), serverUrl }),
      });
      const data = await res.json();

      if (data.success && data.access_token) {
        // Auto-fill the Authorization header and auto-save to mcp.json
        const updatedConfig = {
          ...editing.config,
          headers: { ...editing.config.headers, Authorization: `Bearer ${data.access_token}` },
        };
        setEditing({ ...editing, config: updatedConfig });

        // Auto-persist to mcp.json so the token isn't lost
        const name = editing.isNew ? newServerName.trim() : editing.name;
        if (name) {
          if (editing.isNew) {
            await addServer(name, updatedConfig);
          } else {
            await updateServer(name, updatedConfig);
          }
        }
        toast.success('Token generated, applied, and saved to mcp.json!');
      } else {
        toast.error(data.error || 'Failed to generate token');
      }
    } catch (err) {
      toast.error('Could not reach the server to generate token');
    } finally {
      setGeneratingToken(false);
    }
  };

  const startAddServer = () => {
    setEditing({
      name: '',
      config: { type: 'sse', url: '', headers: { Authorization: 'Bearer ' } },
      isNew: true,
    });
    setNewServerName('');
    setTokenEmail('');
  };

  const startEditServer = (name: string) => {
    const config = mcpConfig.mcpServers[name];
    setEditing({ name, config: { ...config }, isNew: false });
    setTokenEmail('');
  };

  const getStatusIcon = () => {
    if (status.connecting) return <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />;
    if (status.connected) return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    return <XCircle className="w-4 h-4 text-red-500" />;
  };

  const getStatusText = () => {
    if (status.connecting) return 'Connecting...';
    if (status.connected) return activeServer || 'Connected';
    return 'Disconnected';
  };

  const servers = Object.entries(mcpConfig.mcpServers);

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2 bg-stone-700 dark:bg-zinc-800 text-white rounded-lg shadow-lg hover:bg-stone-600 dark:hover:bg-zinc-700 transition-colors"
        title="MCP Connection"
      >
        {getStatusIcon()}
        <span className="text-sm font-medium">{getStatusText()}</span>
        <Settings className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/50 z-40"
            />
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-20 right-4 z-50 w-[440px] max-h-[80vh] overflow-y-auto bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-stone-200 dark:border-zinc-700 p-5"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-stone-800 dark:text-stone-200">
                  MCP Servers
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={startAddServer}
                    className="p-1.5 text-stone-500 hover:text-green-600 dark:text-stone-400 dark:hover:text-green-400 transition-colors"
                    title="Add server"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Server List */}
              {!configLoaded ? (
                <div className="text-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-stone-400 mx-auto" />
                  <p className="text-xs text-stone-500 mt-2">Loading config...</p>
                </div>
              ) : servers.length === 0 && !editing ? (
                <div className="text-center py-6">
                  <p className="text-sm text-stone-500 dark:text-stone-400 mb-3">No MCP servers configured</p>
                  <button
                    onClick={startAddServer}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Add your first server
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {servers.map(([name, config]) => (
                    <div
                      key={name}
                      className={`p-3 rounded-lg border transition-colors ${
                        activeServer === name && status.connected
                          ? 'border-green-400 bg-green-50 dark:bg-green-900/20 dark:border-green-600'
                          : 'border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {config.type === 'sse' ? (
                            <Globe className="w-4 h-4 text-blue-500" />
                          ) : (
                            <Terminal className="w-4 h-4 text-orange-500" />
                          )}
                          <span className="text-sm font-medium text-stone-800 dark:text-stone-200">
                            {name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-200 dark:bg-zinc-700 text-stone-600 dark:text-stone-400 uppercase">
                            {config.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEditServer(name)}
                            className="p-1 text-stone-400 hover:text-blue-500 transition-colors"
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteServer(name)}
                            className="p-1 text-stone-400 hover:text-red-500 transition-colors"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-stone-500 dark:text-stone-400 mb-2 truncate">
                        {config.type === 'sse' ? config.url : `${config.command} ${(config.args || []).join(' ')}`}
                      </p>

                      {activeServer === name && status.connected ? (
                        <button
                          onClick={handleDisconnect}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors"
                        >
                          <WifiOff className="w-3 h-3" /> Disconnect
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConnect(name)}
                          disabled={status.connecting}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          {status.connecting ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Connecting...</>
                          ) : (
                            <><Wifi className="w-3 h-3" /> Connect</>
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Edit / Add Server Form */}
              {editing && (
                <div className="mt-4 p-4 rounded-lg border border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20">
                  <h4 className="text-sm font-semibold text-stone-800 dark:text-stone-200 mb-3">
                    {editing.isNew ? 'Add Server' : `Edit "${editing.name}"`}
                  </h4>

                  {editing.isNew && (
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                        Server Name
                      </label>
                      <input
                        type="text"
                        value={newServerName}
                        onChange={(e) => setNewServerName(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded text-stone-800 dark:text-stone-200"
                        placeholder="my-mcp-server"
                      />
                    </div>
                  )}

                  {/* Transport type */}
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                      Transport
                    </label>
                    <div className="flex gap-2">
                      {(['sse', 'stdio'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setEditing({
                            ...editing,
                            config: t === 'sse'
                              ? { type: 'sse', url: '', headers: { Authorization: 'Bearer ' } }
                              : { type: 'stdio', command: 'uv', args: ['run', 'main.py'], cwd: '' },
                          })}
                          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                            editing.config.type === t
                              ? 'bg-blue-600 text-white'
                              : 'bg-stone-200 dark:bg-zinc-700 text-stone-600 dark:text-stone-400'
                          }`}
                        >
                          {t === 'sse' ? <Globe className="w-3 h-3" /> : <Terminal className="w-3 h-3" />}
                          {t === 'sse' ? 'Remote (SSE)' : 'Local (stdio)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* SSE fields */}
                  {editing.config.type === 'sse' && (
                    <>
                      <div className="mb-3">
                        <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                          SSE URL
                        </label>
                        <input
                          type="text"
                          value={editing.config.url || ''}
                          onChange={(e) => setEditing({
                            ...editing,
                            config: { ...editing.config, url: e.target.value },
                          })}
                          className="w-full px-3 py-1.5 text-sm bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded text-stone-800 dark:text-stone-200"
                          placeholder="https://your-server.com/sse"
                        />
                      </div>

                      {/* Generate Token Section */}
                      <div className="mb-3 p-3 rounded border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Key className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                            Access Token
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400 mb-2">
                          Enter your email to generate a token from the server, or paste an existing token below.
                        </p>
                        <div className="flex gap-2 mb-2">
                          <input
                            type="email"
                            value={tokenEmail}
                            onChange={(e) => setTokenEmail(e.target.value)}
                            className="flex-1 px-2.5 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded text-stone-800 dark:text-stone-200"
                            placeholder="you@email.com"
                          />
                          <button
                            onClick={handleGenerateToken}
                            disabled={generatingToken || !tokenEmail.trim() || !editing.config.url}
                            className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            {generatingToken ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Key className="w-3 h-3" />
                            )}
                            Generate
                          </button>
                        </div>
                        <input
                          type="text"
                          value={editing.config.headers?.Authorization || ''}
                          onChange={(e) => setEditing({
                            ...editing,
                            config: {
                              ...editing.config,
                              headers: { ...editing.config.headers, Authorization: e.target.value },
                            },
                          })}
                          className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded text-stone-800 dark:text-stone-200 font-mono"
                          placeholder="Bearer eyJ..."
                        />
                      </div>
                    </>
                  )}

                  {/* Stdio fields */}
                  {editing.config.type === 'stdio' && (
                    <>
                      <div className="mb-2 p-2 rounded bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700">
                        <p className="text-[11px] text-green-700 dark:text-green-300">
                          Local stdio connections don't require authentication. The MCP server runs as a local process.
                        </p>
                      </div>
                      <div className="mb-3">
                        <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                          Command
                        </label>
                        <input
                          type="text"
                          value={editing.config.command || ''}
                          onChange={(e) => setEditing({
                            ...editing,
                            config: { ...editing.config, command: e.target.value },
                          })}
                          className="w-full px-3 py-1.5 text-sm bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded text-stone-800 dark:text-stone-200"
                          placeholder="uv"
                        />
                      </div>
                      <div className="mb-3">
                        <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                          Args (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={(editing.config.args || []).join(', ')}
                          onChange={(e) => setEditing({
                            ...editing,
                            config: {
                              ...editing.config,
                              args: e.target.value.split(',').map((s) => s.trim()),
                            },
                          })}
                          className="w-full px-3 py-1.5 text-sm bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded text-stone-800 dark:text-stone-200"
                          placeholder="run, main.py"
                        />
                      </div>
                      <div className="mb-3">
                        <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                          Working Directory
                        </label>
                        <input
                          type="text"
                          value={editing.config.cwd || ''}
                          onChange={(e) => setEditing({
                            ...editing,
                            config: { ...editing.config, cwd: e.target.value },
                          })}
                          className="w-full px-3 py-1.5 text-sm bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded text-stone-800 dark:text-stone-200"
                          placeholder="/path/to/backend"
                        />
                      </div>
                    </>
                  )}

                  {/* Save / Cancel */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveServer}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
                    >
                      <Save className="w-3 h-3" /> Save
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-stone-200 dark:bg-zinc-700 hover:bg-stone-300 dark:hover:bg-zinc-600 text-stone-700 dark:text-stone-300 rounded text-xs font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Connected Tools */}
              {status.connected && tools.length > 0 && (
                <div className="mt-4 p-3 bg-stone-50 dark:bg-zinc-900 rounded-lg border border-stone-200 dark:border-zinc-700">
                  <div className="flex items-center gap-2 mb-2">
                    <Wrench className="w-4 h-4 text-stone-600 dark:text-stone-400" />
                    <span className="text-sm font-medium text-stone-700 dark:text-stone-300">
                      {tools.length} Tools Available
                    </span>
                    {loadingTools && <Loader2 className="w-3 h-3 animate-spin text-stone-500" />}
                    <button
                      onClick={fetchTools}
                      disabled={loadingTools}
                      className="ml-auto text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {tools.map((tool, i) => (
                      <div key={i} className="p-2 bg-white dark:bg-zinc-800 rounded border border-stone-200 dark:border-zinc-700">
                        <div className="font-medium text-xs text-stone-800 dark:text-stone-200">
                          {tool.name}
                        </div>
                        {tool.description && (
                          <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 line-clamp-2">
                            {tool.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw Config Editor */}
              <details className="mt-4" onToggle={(e) => {
                if ((e.target as HTMLDetailsElement).open && !editingRawConfig) {
                  setRawConfigText(JSON.stringify(mcpConfig, null, 2));
                  setRawConfigError('');
                }
              }}>
                <summary className="text-xs text-stone-500 dark:text-stone-400 cursor-pointer hover:text-stone-700 dark:hover:text-stone-300">
                  Edit mcp.json
                </summary>
                <div className="mt-2">
                  <textarea
                    value={editingRawConfig ? rawConfigText : JSON.stringify(mcpConfig, null, 2)}
                    onChange={(e) => {
                      setEditingRawConfig(true);
                      setRawConfigText(e.target.value);
                      setRawConfigError('');
                    }}
                    className="w-full p-3 text-[11px] bg-stone-100 dark:bg-zinc-900 rounded border border-stone-200 dark:border-zinc-700 text-stone-700 dark:text-stone-300 font-mono resize-y min-h-[120px] max-h-[300px]"
                    spellCheck={false}
                  />
                  {rawConfigError && (
                    <p className="text-[11px] text-red-500 mt-1">{rawConfigError}</p>
                  )}
                  {editingRawConfig && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={async () => {
                          try {
                            const parsed = JSON.parse(rawConfigText);
                            if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
                              setRawConfigError('Config must have a "mcpServers" object');
                              return;
                            }
                            await saveConfig(parsed);
                            setEditingRawConfig(false);
                            setRawConfigError('');
                            toast.success('mcp.json saved');
                          } catch (e) {
                            setRawConfigError(e instanceof SyntaxError ? `Invalid JSON: ${e.message}` : 'Failed to save');
                          }
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
                      >
                        <Save className="w-3 h-3" /> Save mcp.json
                      </button>
                      <button
                        onClick={() => {
                          setEditingRawConfig(false);
                          setRawConfigText(JSON.stringify(mcpConfig, null, 2));
                          setRawConfigError('');
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-stone-200 dark:bg-zinc-700 hover:bg-stone-300 dark:hover:bg-zinc-600 text-stone-700 dark:text-stone-300 rounded text-xs font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </details>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default MCPConnectionPanel;

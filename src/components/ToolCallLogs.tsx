'use client';

import { useState } from 'react';
import { Wrench, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import type { ToolCallLog } from '@/store/chatStore';

interface ToolCallLogsProps {
  toolCalls: ToolCallLog[];
}

const TOOL_LABELS: Record<string, string> = {
  search_precedents: 'Searching Precedents',
  find_case_laws: 'Finding Case Laws',
  legal_research: 'Legal Research',
  analyze_document: 'Analyzing Document',
  draft_legal_notice: 'Drafting Legal Notice',
  check_limitation: 'Checking Limitation Period',
};

function formatDuration(ms?: number) {
  if (!ms) return '';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export default function ToolCallLogs({ toolCalls }: ToolCallLogsProps) {
  const [expanded, setExpanded] = useState(true);

  if (!toolCalls || toolCalls.length === 0) return null;

  const allDone = toolCalls.every((tc) => tc.status !== 'running');
  const hasErrors = toolCalls.some((tc) => tc.status === 'error');

  return (
    <div className="mb-3 rounded-lg border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800/50 overflow-hidden text-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-stone-100 dark:hover:bg-zinc-700/50 transition-colors"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Wrench size={14} className="text-amber-500" />
        <span className="font-medium text-stone-600 dark:text-stone-300">
          {allDone
            ? `Used ${toolCalls.length} tool${toolCalls.length > 1 ? 's' : ''}${hasErrors ? ' (with errors)' : ''}`
            : `Calling tools...`}
        </span>
        {!allDone && <Loader2 size={14} className="animate-spin text-amber-500 ml-auto" />}
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-1.5">
          {toolCalls.map((tc, i) => (
            <div
              key={i}
              className="flex items-start gap-2 pl-2 py-1 rounded text-stone-600 dark:text-stone-400"
            >
              {tc.status === 'running' && (
                <Loader2 size={14} className="animate-spin text-amber-500 mt-0.5 flex-shrink-0" />
              )}
              {tc.status === 'success' && (
                <CheckCircle2 size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
              )}
              {tc.status === 'error' && (
                <XCircle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <span className="font-medium text-stone-700 dark:text-stone-300">
                  {TOOL_LABELS[tc.tool] || tc.tool}
                </span>
                {tc.durationMs != null && (
                  <span className="ml-2 text-xs text-stone-400 dark:text-stone-500">
                    {formatDuration(tc.durationMs)}
                  </span>
                )}
                {tc.args && Object.keys(tc.args).length > 0 && (
                  <div className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 truncate">
                    {Object.entries(tc.args)
                      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
                      .join(', ')}
                  </div>
                )}
                {tc.error && (
                  <div className="text-xs text-red-400 mt-0.5">{tc.error}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

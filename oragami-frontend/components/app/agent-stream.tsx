"use client";

import { Globe, CheckCircle2, Loader2, AlertCircle, ExternalLink } from "lucide-react";

export type AgentStatus = "queued" | "running" | "complete" | "error";

export interface AgentProgress {
  domain: string;
  status: AgentStatus;
  progress: string[];
  streamUrl?: string;
  error?: string;
}

interface AgentStreamProps {
  agents: AgentProgress[];
}

function StatusIcon({ status }: { status: AgentStatus }) {
  switch (status) {
    case "queued":
      return <div className="w-2 h-2 rounded-full bg-muted-foreground/50" />;
    case "running":
      return <Loader2 className="w-4 h-4 text-foreground animate-spin" />;
    case "complete":
      return <CheckCircle2 className="w-4 h-4 text-green-600" />;
    case "error":
      return <AlertCircle className="w-4 h-4 text-destructive" />;
  }
}

function StatusBadge({ status }: { status: AgentStatus }) {
  const styles = {
    queued: "bg-muted text-muted-foreground",
    running: "bg-foreground/10 text-foreground",
    complete: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-mono rounded ${styles[status]}`}>
      {status}
    </span>
  );
}

function AgentCard({ agent }: { agent: AgentProgress }) {
  return (
    <div className="border border-foreground/10 rounded-lg p-4 bg-card">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <StatusIcon status={agent.status} />
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <span className="font-mono text-sm">{agent.domain}</span>
          </div>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      {agent.progress.length > 0 && (
        <div className="space-y-1 mt-3 pl-7">
          {agent.progress.slice(-4).map((msg, i) => (
            <p
              key={i}
              className={`text-xs font-mono ${
                i === agent.progress.length - 1
                  ? "text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {msg}
            </p>
          ))}
        </div>
      )}

      {agent.streamUrl && agent.status === "running" && (
        <a
          href={agent.streamUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-3 ml-7 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Watch live browser
        </a>
      )}

      {agent.error && (
        <p className="text-xs text-destructive mt-3 ml-7 font-mono">
          {agent.error}
        </p>
      )}
    </div>
  );
}

export function AgentStream({ agents }: AgentStreamProps) {
  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 border border-dashed border-foreground/10 rounded-lg">
        <Globe className="w-8 h-8 text-muted-foreground/50 mb-4" />
        <p className="text-sm text-muted-foreground">No active agents</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Enter domains and start research to see live progress
        </p>
      </div>
    );
  }

  const stats = {
    total: agents.length,
    running: agents.filter((a) => a.status === "running").length,
    complete: agents.filter((a) => a.status === "complete").length,
    queued: agents.filter((a) => a.status === "queued").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Live Agent Progress</h3>
        <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
          <span>{stats.running} running</span>
          <span>{stats.complete}/{stats.total} complete</span>
        </div>
      </div>

      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
        {agents.map((agent) => (
          <AgentCard key={agent.domain} agent={agent} />
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, Database, Zap, CheckCircle, XCircle } from "lucide-react";
import { ICPForm } from "@/components/app/icp-form";
import { AgentStream, AgentProgress } from "@/components/app/agent-stream";
import { LeadsTable, Lead } from "@/components/app/leads-table";
import { SearchBar } from "@/components/app/search-bar";

export default function AppPage() {
  const [agents, setAgents] = useState<AgentProgress[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [isResearching, setIsResearching] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [mongoStatus, setMongoStatus] = useState<{
    testing: boolean;
    result: { success: boolean; message?: string; error?: string; suggestion?: string } | null;
  }>({ testing: false, result: null });

  const testMongoConnection = useCallback(async () => {
    setMongoStatus({ testing: true, result: null });
    try {
      const response = await fetch("/api/test-mongo");
      const data = await response.json();
      setMongoStatus({ testing: false, result: data });
    } catch (error) {
      setMongoStatus({
        testing: false,
        result: { success: false, error: error instanceof Error ? error.message : "Failed to test connection" },
      });
    }
  }, []);

  const handleStartResearch = useCallback(async (domains: string[], goal: string) => {
    setIsResearching(true);
    setAgents(
      domains.map((domain) => ({
        domain,
        status: "queued",
        progress: [],
      }))
    );

    // Process each domain through TinyFish API
    for (const domain of domains) {
      setAgents((prev) =>
        prev.map((a) =>
          a.domain === domain
            ? { ...a, status: "running", progress: ["Starting research..."] }
            : a
        )
      );

      try {
        const response = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain, goal }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Research failed: ${response.status} - ${errorText}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          let buffer = "";
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  
                  if (data.type === "progress") {
                    setAgents((prev) =>
                      prev.map((a) =>
                        a.domain === domain
                          ? { ...a, progress: [...a.progress, data.message] }
                          : a
                      )
                    );
                  } else if (data.type === "stream_url") {
                    setAgents((prev) =>
                      prev.map((a) =>
                        a.domain === domain
                          ? { ...a, streamUrl: data.url }
                          : a
                      )
                    );
                  } else if (data.type === "complete") {
                    setAgents((prev) =>
                      prev.map((a) =>
                        a.domain === domain
                          ? { ...a, status: "complete", progress: [...a.progress, "Research complete!"] }
                          : a
                      )
                    );
                    
                    if (data.lead) {
                      setLeads((prev) => [...prev, data.lead]);
                    }
                  } else if (data.type === "error") {
                    setAgents((prev) =>
                      prev.map((a) =>
                        a.domain === domain
                          ? { ...a, status: "error", error: data.message }
                          : a
                      )
                    );
                  }
                } catch {
                  // Skip invalid JSON
                }
              }
            }
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to connect to research API";
        setAgents((prev) =>
          prev.map((a) =>
            a.domain === domain
              ? { ...a, status: "error", error: errorMessage }
              : a
          )
        );
      }
    }

    setIsResearching(false);
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    setIsSearching(true);
    setSearchActive(true);

    try {
      const response = await fetch("/api/leads/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (response.ok) {
        const data = await response.json();
        setFilteredLeads(data.leads || []);
      }
    } catch (error) {
      console.error("Search failed:", error);
    }

    setIsSearching(false);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchActive(false);
    setFilteredLeads([]);
  }, []);

  const handleExport = useCallback(() => {
    const dataToExport = searchActive ? filteredLeads : leads;
    const csv = [
      ["Company", "Domain", "Industry", "Contacts", "Funding", "Technologies", "Researched At"].join(","),
      ...dataToExport.map((lead) =>
        [
          `"${lead.companyName}"`,
          lead.domain,
          `"${lead.industry}"`,
          lead.contacts.length,
          `"${lead.funding || "N/A"}"`,
          `"${lead.technologies.join("; ")}"`,
          lead.researchedAt,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leadvault-export-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [leads, filteredLeads, searchActive]);

  const displayLeads = searchActive ? filteredLeads : leads;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-foreground/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild className="gap-2">
              <Link href="/">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Link>
            </Button>
            <div className="h-6 w-px bg-foreground/10" />
            <div className="flex items-center gap-2">
              <span className="font-display text-xl">LeadVault</span>
              <span className="text-xs font-mono text-muted-foreground">AI</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3" />
              TinyFish API
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={testMongoConnection}
              disabled={mongoStatus.testing}
              className="gap-1 h-7 text-xs"
            >
              <Database className="w-3 h-3" />
              {mongoStatus.testing ? "Testing..." : "Test MongoDB"}
            </Button>
            {mongoStatus.result && (
              <span className={mongoStatus.result.success ? "text-green-500" : "text-red-500"}>
                {mongoStatus.result.success ? "Connected!" : "Failed"}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* MongoDB Test Results */}
      {mongoStatus.result && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <Alert variant={mongoStatus.result.success ? "default" : "destructive"}>
            {mongoStatus.result.success ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <AlertTitle>
              {mongoStatus.result.success ? "MongoDB Connected" : "MongoDB Connection Failed"}
            </AlertTitle>
            <AlertDescription className="mt-2">
              {mongoStatus.result.success ? (
                <span>{mongoStatus.result.message}</span>
              ) : (
                <div className="space-y-1">
                  <p className="font-mono text-xs break-all">{mongoStatus.result.error}</p>
                  {mongoStatus.result.suggestion && (
                    <p className="text-sm mt-2">{mongoStatus.result.suggestion}</p>
                  )}
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-6 text-xs"
                onClick={() => setMongoStatus({ testing: false, result: null })}
              >
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-12 gap-8">
          {/* Left Column - ICP Form */}
          <div className="lg:col-span-4">
            <div className="sticky top-8">
              <div className="mb-6">
                <h1 className="text-2xl font-display mb-2">Lead Research</h1>
                <p className="text-sm text-muted-foreground">
                  Enter company domains to research. Agents will extract contacts,
                  funding, and more.
                </p>
              </div>
              <ICPForm onSubmit={handleStartResearch} isLoading={isResearching} />
            </div>
          </div>

          {/* Right Column - Results */}
          <div className="lg:col-span-8 space-y-8">
            {/* Agent Progress */}
            {agents.length > 0 && (
              <section>
                <AgentStream agents={agents} />
              </section>
            )}

            {/* Search + Leads */}
            <section className="space-y-6">
              {leads.length > 0 && (
                <SearchBar
                  onSearch={handleSearch}
                  onClear={handleClearSearch}
                  isSearching={isSearching}
                  hasResults={searchActive}
                />
              )}
              <LeadsTable leads={displayLeads} onExport={leads.length > 0 ? handleExport : undefined} />
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

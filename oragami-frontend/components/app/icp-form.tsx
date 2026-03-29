"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Play, Loader2 } from "lucide-react";

interface ICPFormProps {
  onSubmit: (domains: string[], goal: string) => void;
  isLoading: boolean;
}

const defaultGoal = `Extract the following information:
1. Company description and industry
2. Key decision-makers (names, titles, LinkedIn if visible)
3. Recent news or funding announcements
4. Contact information (emails, forms, phone)
5. Technologies/tools mentioned on the site`;

export function ICPForm({ onSubmit, isLoading }: ICPFormProps) {
  const [domains, setDomains] = useState("");
  const [goal, setGoal] = useState(defaultGoal);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const domainList = domains
      .split("\n")
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
    
    if (domainList.length === 0) return;
    onSubmit(domainList, goal);
  };

  const domainCount = domains
    .split("\n")
    .map((d) => d.trim())
    .filter((d) => d.length > 0).length;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">
            Target Domains
          </label>
          <span className="text-xs font-mono text-muted-foreground">
            {domainCount} {domainCount === 1 ? "domain" : "domains"}
          </span>
        </div>
        <Textarea
          value={domains}
          onChange={(e) => setDomains(e.target.value)}
          placeholder={`stripe.com
notion.so
linear.app
figma.com`}
          className="min-h-[140px] font-mono text-sm bg-background border-foreground/10 focus:border-foreground/30 resize-none"
          disabled={isLoading}
        />
        <p className="text-xs text-muted-foreground">
          Enter one domain per line. Agents will research each site in parallel.
        </p>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          Research Goal
        </label>
        <Textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          className="min-h-[160px] text-sm bg-background border-foreground/10 focus:border-foreground/30 resize-none"
          disabled={isLoading}
        />
        <p className="text-xs text-muted-foreground">
          Describe what you want the agents to extract. Be specific for better results.
        </p>
      </div>

      <Button
        type="submit"
        disabled={domainCount === 0 || isLoading}
        className="w-full h-12 bg-foreground hover:bg-foreground/90 text-background rounded-full group"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Researching...
          </>
        ) : (
          <>
            <Play className="w-4 h-4 mr-2" />
            Start Research ({domainCount} {domainCount === 1 ? "site" : "sites"})
          </>
        )}
      </Button>

      {domainCount > 0 && (
        <p className="text-xs text-center text-muted-foreground font-mono">
          Estimated time: ~{Math.ceil(domainCount * 0.5)} - {domainCount * 2} minutes
        </p>
      )}
    </form>
  );
}

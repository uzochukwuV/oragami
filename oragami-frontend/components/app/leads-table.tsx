"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Download,
  Building2,
  Users,
  Banknote,
  Mail,
} from "lucide-react";

export interface Lead {
  id: string;
  domain: string;
  companyName: string;
  description: string;
  industry: string;
  contacts: {
    name: string;
    title: string;
    email?: string;
    linkedin?: string;
  }[];
  funding?: string;
  technologies: string[];
  researchedAt: string;
  sourceUrls: string[];
  similarity?: number;
}

interface LeadsTableProps {
  leads: Lead[];
  onExport?: () => void;
}

function LeadRow({ lead }: { lead: Lead }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-foreground/10 rounded-lg overflow-hidden bg-card">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-foreground/5 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-foreground truncate">
                {lead.companyName}
              </h4>
              {lead.similarity && (
                <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {Math.round(lead.similarity * 100)}% match
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {lead.domain} | {lead.industry}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 shrink-0">
          <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {lead.contacts.length}
            </span>
            {lead.funding && (
              <span className="flex items-center gap-1">
                <Banknote className="w-3 h-3" />
                {lead.funding}
              </span>
            )}
          </div>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-foreground/5">
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            {lead.description}
          </p>

          {lead.contacts.length > 0 && (
            <div className="mb-4">
              <h5 className="text-xs font-medium text-foreground mb-2 flex items-center gap-1">
                <Users className="w-3 h-3" />
                Contacts ({lead.contacts.length})
              </h5>
              <div className="grid gap-2">
                {lead.contacts.map((contact, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-muted/50 px-3 py-2 rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium">{contact.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {contact.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {contact.email && (
                        <a
                          href={`mailto:${contact.email}`}
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                          <Mail className="w-3 h-3" />
                          Email
                        </a>
                      )}
                      {contact.linkedin && (
                        <a
                          href={contact.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          LinkedIn
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {lead.technologies.length > 0 && (
            <div className="mb-4">
              <h5 className="text-xs font-medium text-foreground mb-2">
                Technologies
              </h5>
              <div className="flex flex-wrap gap-1">
                {lead.technologies.map((tech, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 bg-foreground/5 rounded text-muted-foreground"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-foreground/5">
            <span className="text-xs text-muted-foreground">
              Researched {new Date(lead.researchedAt).toLocaleDateString()}
            </span>
            <div className="flex items-center gap-2">
              {lead.sourceUrls.slice(0, 2).map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Source {i + 1}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function LeadsTable({ leads, onExport }: LeadsTableProps) {
  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 border border-dashed border-foreground/10 rounded-lg">
        <Building2 className="w-8 h-8 text-muted-foreground/50 mb-4" />
        <p className="text-sm text-muted-foreground">No leads yet</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Research some companies to see results here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          Leads ({leads.length})
        </h3>
        {onExport && (
          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            className="h-8 text-xs"
          >
            <Download className="w-3 h-3 mr-1" />
            Export CSV
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {leads.map((lead) => (
          <LeadRow key={lead.id} lead={lead} />
        ))}
      </div>
    </div>
  );
}

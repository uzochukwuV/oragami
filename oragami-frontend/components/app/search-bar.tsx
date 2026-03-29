"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Sparkles, X } from "lucide-react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  isSearching: boolean;
  hasResults: boolean;
}

const suggestions = [
  "fintech startups with recent funding",
  "AI companies hiring engineers",
  "Series A with founder contact info",
  "e-commerce with Shopify tech stack",
];

export function SearchBar({
  onSearch,
  onClear,
  isSearching,
  hasResults,
}: SearchBarProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const handleSuggestion = (suggestion: string) => {
    setQuery(suggestion);
    onSearch(suggestion);
  };

  const handleClear = () => {
    setQuery("");
    onClear();
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search leads with natural language..."
            className="pl-11 pr-24 h-12 bg-background border-foreground/10 focus:border-foreground/30"
            disabled={isSearching}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {hasResults && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="h-8 px-2"
              >
                <X className="w-3 h-3" />
              </Button>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={!query.trim() || isSearching}
              className="h-8 bg-foreground text-background hover:bg-foreground/90"
            >
              <Sparkles className="w-3 h-3 mr-1" />
              Search
            </Button>
          </div>
        </div>
      </form>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Try:</span>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => handleSuggestion(suggestion)}
            className="text-xs px-2 py-1 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
            disabled={isSearching}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

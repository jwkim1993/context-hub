import { Search, Sparkles, X } from "lucide-react";
import { useState, useCallback } from "react";
import { useLanguage } from "../lib/LanguageContext";

interface SearchBarProps {
  onSearch: (query: string) => void;
  onSemanticSearch: (query: string) => void;
  hasApiKey: boolean;
}

export function SearchBar({ onSearch, onSemanticSearch, hasApiKey }: SearchBarProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [isSemanticMode, setIsSemanticMode] = useState(false);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    (isSemanticMode && hasApiKey) ? onSemanticSearch(query) : onSearch(query);
  }, [query, isSemanticMode, hasApiKey, onSearch, onSemanticSearch]);

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3 flex-1">
      <div className="relative flex-1">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isSemanticMode ? t.searchSemanticPlaceholder : t.searchTextPlaceholder}
          className="w-full h-12 pl-12 pr-12 bg-bg border border-border rounded-xl
                     text-[15px] text-text placeholder:text-text-muted
                     focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue/50 transition-all"
        />
        {query && (
          <button type="button" onClick={() => { setQuery(""); onSearch(""); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center
                       rounded-lg text-text-muted hover:text-text-secondary hover:bg-border-light transition-all">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {hasApiKey && (
        <button type="button" onClick={() => setIsSemanticMode(!isSemanticMode)}
          className={`h-12 px-5 rounded-xl text-[14px] font-semibold border flex items-center gap-2 transition-all whitespace-nowrap
            ${isSemanticMode
              ? "bg-green-light text-green border-green/30 shadow-sm"
              : "bg-white text-text-tertiary border-border hover:border-green/40 hover:text-green"}`}>
          <Sparkles className="w-4.5 h-4.5" />
          {t.aiSearch}
        </button>
      )}
    </form>
  );
}

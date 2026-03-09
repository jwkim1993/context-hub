import { ExternalLink, GitPullRequest, CircleDot, Ticket, Link2, BookOpen } from "lucide-react";
import type { LinkRecord } from "../lib/types";
import { useLanguage } from "../lib/LanguageContext";

interface LinkPanelProps { links: LinkRecord[]; }

function LinkIcon({ type }: { type: string }) {
  const cls = "w-4 h-4";
  switch (type) {
    case "github_pr": return <GitPullRequest className={`${cls} text-github-color`} />;
    case "github_issue": return <CircleDot className={`${cls} text-github-color`} />;
    case "jira": return <Ticket className={`${cls} text-jira-color`} />;
    case "confluence": return <BookOpen className={`${cls} text-[#1868DB]`} />;
    default: return <Link2 className={`${cls} text-text-tertiary`} />;
  }
}

function linkTypeLabel(type: string): string {
  switch (type) {
    case "github_pr": return "Pull Requests";
    case "github_issue": return "Issues";
    case "jira": return "Jira Tickets";
    case "confluence": return "Wiki Pages";
    default: return "Links";
  }
}

function linkBg(type: string): string {
  switch (type) {
    case "github_pr": case "github_issue": return "hover:bg-github-bg";
    case "jira": return "hover:bg-jira-bg";
    case "confluence": return "hover:bg-blue-50";
    default: return "hover:bg-sidebar-hover";
  }
}

export function LinkPanel({ links }: LinkPanelProps) {
  const { t } = useLanguage();
  if (links.length === 0) return null;

  const grouped = links.reduce((acc, link) => {
    if (!acc[link.link_type]) acc[link.link_type] = [];
    acc[link.link_type].push(link);
    return acc;
  }, {} as Record<string, LinkRecord[]>);

  const deduped = Object.entries(grouped).map(([type, items]) => [
    type,
    items.filter((l, i, arr) => arr.findIndex((x) => x.url === l.url) === i),
  ] as const);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-border">
        <h3 className="text-[14px] font-semibold text-text">{t.connectedResourcesTitle}</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {deduped.map(([type, items]) => (
          <div key={type}>
            <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-2">
              {linkTypeLabel(type)}
            </p>
            <div className="space-y-1">
              {items.map((link) => (
                <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group ${linkBg(link.link_type)}`}>
                  <LinkIcon type={link.link_type} />
                  <span className="flex-1 min-w-0 text-[13px] text-text-secondary group-hover:text-blue truncate">
                    {link.display_text || link.url}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

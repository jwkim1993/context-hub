import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Sparkles, Loader2, GitBranch, FolderOpen, MessageCircle, X,
  ExternalLink, GitPullRequest, CircleDot, Ticket, Link2,
  User, Bot,
} from "lucide-react";
import type { ChatRecord, MessageRecord, LinkRecord } from "../lib/types";
import { getChatMessages, getChatLinks, updateChatSummary } from "../lib/api";
import { summarizeChat, getApiKey } from "../lib/claude";
import { useLanguage } from "../lib/LanguageContext";

interface ChatCardProps {
  chat: ChatRecord;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onSummaryUpdated: () => void;
}

function formatRelativeDate(
  dateStr: string | null,
  locale: string,
  labels: { justNow: string; minutesAgo: (n: number) => string; hoursAgo: (n: number) => string; yesterday: string; daysAgo: (n: number) => string },
): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return labels.justNow;
    if (diffMin < 60) return labels.minutesAgo(diffMin);
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return labels.hoursAgo(diffHours);
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return labels.yesterday;
    if (diffDays < 7) return labels.daysAgo(diffDays);
    return date.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
  } catch { return ""; }
}

function formatFullDate(dateStr: string | null, locale: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleString(locale, {
      year: "numeric", month: "numeric", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return ""; }
}

function SourceBadge({ source }: { source: string }) {
  const isCursor = source === "cursor";
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-bold tracking-wide
      ${isCursor ? "bg-cursor-bg text-cursor-color" : "bg-codex-bg text-codex-color"}`}>
      {isCursor ? "⚡ Cursor" : "🔧 Codex"}
    </span>
  );
}

function ConfluenceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.73 18.77c-.36.56-.53 1-.2 1.46l2.46 4.02c.3.46.86.75 1.14.32.28-.43 3.15-5.51 5.87-5.51s5.6 5.08 5.87 5.51c.28.43.84.14 1.14-.32l2.46-4.02c.33-.46.16-.9-.2-1.46C20.13 16.8 15.88 12 12 12s-8.13 4.8-9.27 6.77z" />
      <path d="M21.27 5.23c.36-.56.53-1 .2-1.46L19.01.75c-.3-.46-.86-.75-1.14-.32-.28.43-3.15 5.51-5.87 5.51S6.4.86 6.13.43C5.85 0 5.29.29 4.99.75L2.53 4.77c-.33.46-.16.9.2 1.46C3.87 8.2 8.12 13 12 13s8.13-4.8 9.27-6.77z" />
    </svg>
  );
}

function LinkIcon({ type }: { type: string }) {
  const cls = "w-4 h-4";
  switch (type) {
    case "github_pr": return <GitPullRequest className={`${cls} text-purple`} />;
    case "github_issue": return <CircleDot className={`${cls} text-purple`} />;
    case "jira": return <Ticket className={`${cls} text-blue`} />;
    case "confluence": return <ConfluenceIcon className={`${cls} text-[#1868DB]`} />;
    default: return <Link2 className={`${cls} text-text-tertiary`} />;
  }
}

export function ChatCard({ chat, index, isExpanded, onToggle, onSummaryUpdated }: ChatCardProps) {
  const { lang, t } = useLanguage();
  const locale = lang === "ko" ? "ko-KR" : "en-US";
  const dateLabels = { justNow: t.justNow, minutesAgo: t.minutesAgo, hoursAgo: t.hoursAgo, yesterday: t.yesterday, daysAgo: t.daysAgo };

  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);

  useEffect(() => {
    if (!isExpanded) return;
    setIsLoading(true);
    Promise.all([getChatMessages(chat.id), getChatLinks(chat.id)]).then(([msgs, lnks]) => {
      setMessages(msgs);
      setLinks(lnks.filter((l, i, arr) => arr.findIndex((x) => x.url === l.url) === i));
      setIsLoading(false);
    });
  }, [isExpanded, chat.id]);

  const handleSummarize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!getApiKey()) return;
    setIsSummarizing(true);
    try {
      const msgs = messages.length > 0 ? messages : await getChatMessages(chat.id);
      const result = await summarizeChat(msgs);
      await updateChatSummary(chat.id, result.summary, result.tags.join(", "));
      onSummaryUpdated();
    } catch (err) { console.error(err); }
    finally { setIsSummarizing(false); }
  };

  return (
    <div
      className="animate-fade-in"
      style={{ animationDelay: `${Math.min(index * 40, 300)}ms` }}
    >
      <div className={`bg-white rounded-2xl transition-all duration-200
        ${isExpanded
          ? "border-2 border-blue/40 shadow-xl"
          : "border border-[#d8dce3] shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.1)] hover:border-blue/30"}`}>

        {/* ─── Card Header (always visible) ─── */}
        <div className="cursor-pointer px-9 pt-7 pb-6" onClick={onToggle}>
          {/* Row 1: Title + Badge */}
          <div className="flex items-start justify-between gap-8 mb-4">
            <h3 className={`text-[18px] font-bold leading-[1.4] flex-1 transition-colors
              ${isExpanded ? "text-blue" : "text-text hover:text-blue"}`}>
              {chat.title || t.untitled}
            </h3>
            <div className="flex-shrink-0 mt-0.5">
              <SourceBadge source={chat.source} />
            </div>
          </div>

          {/* Row 2: Meta */}
          <div className="flex items-center gap-5 text-[13.5px] text-text-tertiary">
            {chat.workspace && (
              <span className="flex items-center gap-1.5">
                <FolderOpen className="w-4 h-4" /> {chat.workspace}
              </span>
            )}
            {chat.git_branch && (
              <span className="flex items-center gap-1.5">
                <GitBranch className="w-4 h-4" /> {chat.git_branch}
              </span>
            )}
            {messages.length > 0 && (
              <span className="flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" /> {messages.length} {t.messages}
              </span>
            )}
            <span className="ml-auto text-[13px]">
              {t.created}: {formatRelativeDate(chat.created_at, locale, dateLabels)}
              {chat.updated_at && chat.updated_at !== chat.created_at && (
                <span className="ml-5">{t.updated}: {formatRelativeDate(chat.updated_at, locale, dateLabels)}</span>
              )}
            </span>
          </div>

          {/* Row 3: Summary */}
          {chat.summary && !isExpanded && (
            <p className="text-[14.5px] text-text-secondary mt-4 leading-[1.7] line-clamp-2">
              {chat.summary}
            </p>
          )}

          {/* Row 4: Action buttons + tags */}
          <div className="flex items-center gap-3 mt-5 pt-5 border-t border-[#eef0f3]">
            <button onClick={handleSummarize} disabled={isSummarizing}
              className={`h-10 px-5 rounded-xl text-[13.5px] font-semibold border flex items-center gap-2 transition-all
                ${chat.summary
                  ? "bg-green-light text-green border-green/25 hover:bg-green/15"
                  : "bg-white text-text-secondary border-[#e2e5ea] hover:border-green/40 hover:text-green"}`}>
              {isSummarizing
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Sparkles className="w-4 h-4" />}
              {t.aiSummary}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className="h-10 px-5 rounded-xl text-[13.5px] font-semibold border border-[#e2e5ea]
                         bg-white text-text-secondary hover:border-blue/30 hover:text-blue flex items-center gap-2 transition-all">
              <MessageCircle className="w-4 h-4" />
              {t.viewConversation}
            </button>
            {chat.tags && (
              <div className="flex items-center gap-2 ml-auto">
                {chat.tags.split(",").slice(0, 4).map((tag, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-lg bg-[#f5f6f8] text-[12.5px] font-medium text-text-tertiary border border-[#eef0f3]">
                    {tag.trim()}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── Expanded Detail ─── */}
        {isExpanded && (
          <div className="border-t border-border animate-slide-down">
            {/* Expanded header */}
            <div className="px-9 py-6 bg-bg/60 flex items-center justify-between">
              <div className="text-[13.5px] text-text-tertiary">
                {t.createdAt}: {formatFullDate(chat.created_at, locale)}
              </div>
              <div className="flex items-center gap-2.5">
                {links.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {links.slice(0, 5).map((link) => (
                      <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                        className={`h-9 px-4 rounded-xl text-[12.5px] font-semibold border flex items-center gap-2 transition-all
                          ${link.link_type === "jira"
                            ? "bg-jira-bg text-jira-color border-jira-color/15 hover:border-jira-color/30"
                            : link.link_type === "confluence"
                              ? "bg-blue-50 text-[#1868DB] border-[#1868DB]/15 hover:border-[#1868DB]/30"
                              : link.link_type.startsWith("github")
                                ? "bg-github-bg text-github-color border-github-color/15 hover:border-github-color/30"
                                : "bg-bg text-text-secondary border-border hover:border-blue/30"}`}>
                        <LinkIcon type={link.link_type} />
                        <span className="max-w-[220px] truncate">{link.display_text || "Link"}</span>
                        <ExternalLink className="w-3 h-3 opacity-40" />
                      </a>
                    ))}
                  </div>
                )}
                <button onClick={onToggle}
                  className="w-9 h-9 flex items-center justify-center rounded-xl text-text-tertiary
                             hover:bg-white hover:text-text-secondary transition-all ml-1 border border-border">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Summary section */}
            {chat.summary && (
              <div className="px-9 py-6 border-t border-border-light bg-white">
                <h4 className="text-[15px] font-bold text-text mb-2">{t.summary}</h4>
                <p className="text-[14.5px] text-text-secondary leading-[1.75]">{chat.summary}</p>
              </div>
            )}

            {/* Messages */}
            <div className="border-t border-border-light">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-blue" />
                </div>
              ) : (
                <div className="max-h-[600px] overflow-y-auto">
                  {messages.map((msg, idx) => (
                    <MessageRow key={msg.id} message={msg} index={idx} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageRow({ message, index }: { message: MessageRecord; index: number }) {
  const { lang } = useLanguage();
  const locale = lang === "ko" ? "ko-KR" : "en-US";
  const isUser = message.role === "user";

  return (
    <div className={`px-9 py-7 ${index > 0 ? "border-t border-border-light" : ""} ${isUser ? "bg-white" : "bg-bg/40"}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0
          ${isUser ? "bg-blue text-white" : "bg-border text-text-tertiary"}`}>
          {isUser ? <User className="w-4.5 h-4.5" /> : <Bot className="w-4.5 h-4.5" />}
        </div>
        <span className={`text-[15px] font-bold ${isUser ? "text-blue" : "text-text-secondary"}`}>
          {isUser ? "You" : "Assistant"}
        </span>
        {message.timestamp && (
          <span className="text-[13px] text-text-muted">
            {new Date(message.timestamp).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
      {/* Content */}
      <div className="pl-12">
        <div className="prose max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

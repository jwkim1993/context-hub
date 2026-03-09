import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Bot,
  ChevronDown,
  CircleDot,
  ExternalLink,
  FolderKanban,
  Github,
  GitPullRequest,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Tag,
  Ticket,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";

import { Settings } from "./components/Settings";
import { generateTagsFromChat, getApiKey, summarizeChat } from "./lib/claude";
import {
  addManualLink,
  deleteManualLink,
  getAllChats,
  getAllLinks,
  getChatMessages,
  openExternalUrl,
  scanAllChats,
  updateChatSummary,
} from "./lib/api";
import type { ChatRecord, LinkRecord, SourceFilter } from "./lib/types";
import { useLanguage } from "./lib/LanguageContext";

type ConnectionFilter = "all" | "repo" | "pr" | "jira" | "wiki";
type AiAction = "summary" | "tags" | null;
type Feedback = { type: "success" | "error"; message: string } | null;

function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function summarizeConnection(chat: ChatRecord, links: LinkRecord[]): string {
  const prCount = links.filter((link) => link.link_type === "github_pr").length;
  const jiraCount = links.filter((link) => link.link_type === "jira").length;
  const wikiCount = links.filter((link) => link.link_type === "confluence").length;
  const repo = chat.git_repo || links.find((link) => link.link_type === "github_repo")?.display_text;

  const parts: string[] = [];
  if (repo) parts.push(`repo: ${repo}`);
  if (prCount > 0) parts.push(`PR ${prCount}`);
  if (jiraCount > 0) parts.push(`Jira ${jiraCount}`);
  if (wikiCount > 0) parts.push(`Wiki ${wikiCount}`);
  return parts.join(" · ");
}

function linkTypeLabel(type: LinkRecord["link_type"]): string {
  switch (type) {
    case "github_pr":
      return "PR";
    case "github_issue":
      return "Issue";
    case "github_repo":
      return "Repo";
    case "jira":
      return "Jira";
    case "confluence":
      return "Wiki";
    default:
      return "Link";
  }
}

function ConfluenceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.73 18.77c-.36.56-.53 1-.2 1.46l2.46 4.02c.3.46.86.75 1.14.32.28-.43 3.15-5.51 5.87-5.51s5.6 5.08 5.87 5.51c.28.43.84.14 1.14-.32l2.46-4.02c.33-.46.16-.9-.2-1.46C20.13 16.8 15.88 12 12 12s-8.13 4.8-9.27 6.77z" />
      <path d="M21.27 5.23c.36-.56.53-1 .2-1.46L19.01.75c-.3-.46-.86-.75-1.14-.32-.28.43-3.15 5.51-5.87 5.51S6.4.86 6.13.43C5.85 0 5.29.29 4.99.75L2.53 4.77c-.33.46-.16.9.2 1.46C3.87 8.2 8.12 13 12 13s8.13-4.8 9.27-6.77z" />
    </svg>
  );
}

function LinkTypeIcon({ type }: { type: LinkRecord["link_type"] }) {
  switch (type) {
    case "github_pr":
      return <GitPullRequest className="h-4 w-4 text-accent" />;
    case "github_issue":
      return <CircleDot className="h-4 w-4 text-accent" />;
    case "github_repo":
      return <Github className="h-4 w-4 text-accent" />;
    case "jira":
      return <Ticket className="h-4 w-4 text-warn" />;
    case "confluence":
      return <ConfluenceIcon className="h-4 w-4 text-[#1868DB]" />;
    default:
      return <Link2 className="h-4 w-4 text-muted" />;
  }
}

function dedupeLinks(links: LinkRecord[]): LinkRecord[] {
  const map = new Map<string, LinkRecord>();
  for (const link of links) {
    const key = link.url.trim().toLowerCase();
    const existing = map.get(key);
    if (!existing || (link.added_manually && !existing.added_manually)) {
      map.set(key, link);
    }
  }
  return [...map.values()];
}

function formatDate(date: string | null, locale: string, noDateLabel: string): string {
  if (!date) return noDateLabel;
  return new Date(date).toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function App() {
  const { lang, t } = useLanguage();
  const locale = lang === "ko" ? "ko-KR" : "en-US";

  const [chats, setChats] = useState<ChatRecord[]>([]);
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);

  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [connectionFilter, setConnectionFilter] = useState<ConnectionFilter>("all");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [showAllTags, setShowAllTags] = useState(false);

  const [isBooting, setIsBooting] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [aiAction, setAiAction] = useState<AiAction>(null);
  const [isAddingLink, setIsAddingLink] = useState(false);

  const [manualLinkUrl, setManualLinkUrl] = useState("");
  const [manualLinkLabel, setManualLinkLabel] = useState("");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(!!getApiKey());
  const [feedback, setFeedback] = useState<Feedback>(null);

  const loadWorkspace = useCallback(async (scan: boolean) => {
    if (isBooting) {
      setIsBooting(true);
    } else {
      setIsRefreshing(true);
    }

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const minDelay = !isBooting
      ? new Promise((r) => setTimeout(r, 600))
      : Promise.resolve();

    try {
      const [nextChats, nextLinks] = await Promise.all([
        scan ? scanAllChats() : getAllChats(),
        getAllLinks(),
        minDelay,
      ]);
      setChats(nextChats);
      setLinks(nextLinks);
      setFeedback(null);
    } catch (error) {
      console.error(error);
      setFeedback({ type: "error", message: t.feedbackLoadError });
    } finally {
      setIsBooting(false);
      setIsRefreshing(false);
    }
  }, [isBooting]);

  useEffect(() => {
    void loadWorkspace(true);
  }, [loadWorkspace]);

  useEffect(() => {
    if (chats.length === 0) {
      setSelectedChatId(null);
      return;
    }

    if (!selectedChatId || !chats.some((chat) => chat.id === selectedChatId)) {
      setSelectedChatId(chats[0].id);
    }
  }, [chats, selectedChatId]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2600);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const linksByChatId = useMemo(() => {
    return links.reduce<Record<number, LinkRecord[]>>((acc, link) => {
      if (!acc[link.chat_id]) acc[link.chat_id] = [];
      acc[link.chat_id].push(link);
      return acc;
    }, {});
  }, [links]);

  const tagStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const chat of chats) {
      for (const tag of parseTags(chat.tags)) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }, [chats]);

  const TOP_TAG_COUNT = 6;

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  const filteredChats = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

    return chats.filter((chat) => {
      if (sourceFilter !== "all" && chat.source !== sourceFilter) return false;

      const chatLinks = linksByChatId[chat.id] ?? [];
      const hasRepoConnection = !!chat.git_repo || chatLinks.some((link) => link.link_type === "github_repo");
      const hasPrConnection = chatLinks.some((link) => link.link_type === "github_pr");
      const hasJiraConnection = chatLinks.some((link) => link.link_type === "jira");
      const hasWikiConnection = chatLinks.some((link) => link.link_type === "confluence");

      if (connectionFilter === "repo" && !hasRepoConnection) return false;
      if (connectionFilter === "pr" && !hasPrConnection) return false;
      if (connectionFilter === "jira" && !hasJiraConnection) return false;
      if (connectionFilter === "wiki" && !hasWikiConnection) return false;

      if (selectedTags.size > 0) {
        const chatTagSet = new Set(parseTags(chat.tags));
        for (const requiredTag of selectedTags) {
          if (!chatTagSet.has(requiredTag)) return false;
        }
      }

      if (tokens.length === 0) return true;

      const linkText = chatLinks
        .map((link) => `${link.url} ${link.display_text ?? ""}`)
        .join(" ");

      const haystack = [
        chat.title,
        chat.summary,
        chat.tags,
        chat.workspace,
        chat.git_repo,
        chat.git_branch,
        linkText,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return tokens.every((token) => haystack.includes(token));
    });
  }, [chats, connectionFilter, linksByChatId, query, selectedTags, sourceFilter]);

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  const selectedLinks = useMemo(() => {
    if (!selectedChat) return [];
    return dedupeLinks(linksByChatId[selectedChat.id] ?? []);
  }, [linksByChatId, selectedChat]);

  const summaryCount = useMemo(
    () => chats.filter((chat) => !!chat.summary?.trim()).length,
    [chats],
  );

  const uniqueConnectedResourceCount = useMemo(
    () => new Set(links.map((link) => link.url.trim().toLowerCase())).size,
    [links],
  );

  const manualLinkCount = useMemo(
    () => links.filter((link) => link.added_manually).length,
    [links],
  );

  const handleSummarize = useCallback(async () => {
    if (!selectedChat || !hasApiKey) return;

    setAiAction("summary");
    try {
      const messages = await getChatMessages(selectedChat.id);
      const result = await summarizeChat(messages);
      const tags = result.tags.join(", ");

      await updateChatSummary(selectedChat.id, result.summary, tags);
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === selectedChat.id
            ? { ...chat, summary: result.summary, tags }
            : chat,
        ),
      );
      setFeedback({ type: "success", message: t.feedbackSummaryUpdated });
    } catch (error) {
      console.error(error);
      setFeedback({ type: "error", message: t.feedbackSummaryError });
    } finally {
      setAiAction(null);
    }
  }, [hasApiKey, selectedChat]);

  const handleGenerateTags = useCallback(async () => {
    if (!selectedChat || !hasApiKey) return;

    setAiAction("tags");
    try {
      const messages = await getChatMessages(selectedChat.id);
      const tags = (await generateTagsFromChat(messages)).join(", ");

      await updateChatSummary(selectedChat.id, selectedChat.summary ?? "", tags);
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === selectedChat.id
            ? { ...chat, tags }
            : chat,
        ),
      );
      setFeedback({ type: "success", message: t.feedbackTagsUpdated });
    } catch (error) {
      console.error(error);
      setFeedback({ type: "error", message: t.feedbackTagsError });
    } finally {
      setAiAction(null);
    }
  }, [hasApiKey, selectedChat]);

  const handleAddTag = useCallback(async (newTag: string) => {
    if (!selectedChat) return;
    const trimmed = newTag.trim().toLowerCase().replace(/[,#]/g, "").trim();
    if (!trimmed) return;

    const existing = parseTags(selectedChat.tags);
    if (existing.includes(trimmed)) return;

    const updatedTags = [...existing, trimmed].join(", ");
    try {
      await updateChatSummary(selectedChat.id, selectedChat.summary ?? "", updatedTags);
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === selectedChat.id ? { ...chat, tags: updatedTags } : chat,
        ),
      );
      setFeedback({ type: "success", message: t.tagAdded });
    } catch (error) {
      console.error(error);
      setFeedback({ type: "error", message: t.tagError });
    }
  }, [selectedChat, t]);

  const handleRemoveTag = useCallback(async (tagToRemove: string) => {
    if (!selectedChat) return;

    const existing = parseTags(selectedChat.tags);
    const updatedTags = existing.filter((tag) => tag !== tagToRemove).join(", ");
    try {
      await updateChatSummary(selectedChat.id, selectedChat.summary ?? "", updatedTags);
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === selectedChat.id ? { ...chat, tags: updatedTags } : chat,
        ),
      );
      setFeedback({ type: "success", message: t.tagRemoved });
    } catch (error) {
      console.error(error);
      setFeedback({ type: "error", message: t.tagError });
    }
  }, [selectedChat, t]);

  const handleAddManualLink = useCallback(async () => {
    if (!selectedChat || !manualLinkUrl.trim()) return;

    setIsAddingLink(true);
    try {
      const created = await addManualLink(selectedChat.id, manualLinkUrl, manualLinkLabel || undefined);
      setLinks((prev) => [created, ...prev]);
      setManualLinkUrl("");
      setManualLinkLabel("");
      setFeedback({ type: "success", message: t.feedbackLinkAdded });
    } catch (error) {
      console.error(error);
      setFeedback({ type: "error", message: t.feedbackLinkAddError });
    } finally {
      setIsAddingLink(false);
    }
  }, [manualLinkLabel, manualLinkUrl, selectedChat]);

  const handleDeleteManualLink = useCallback(async (linkId: number) => {
    try {
      const deleted = await deleteManualLink(linkId);
      if (deleted) {
        setLinks((prev) => prev.filter((link) => link.id !== linkId));
        setFeedback({ type: "success", message: t.feedbackLinkDeleted });
      }
    } catch (error) {
      console.error(error);
      setFeedback({ type: "error", message: t.feedbackLinkDeleteError });
    }
  }, []);

  const handleOpenLink = useCallback(async (url: string) => {
    try {
      await openExternalUrl(url);
    } catch (error) {
      console.error(error);
      setFeedback({ type: "error", message: t.feedbackOpenLinkError });
    }
  }, []);

  return (
    <div className="min-h-screen bg-base text-ink">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-20 top-8 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-80 w-80 rounded-full bg-warn/20 blur-3xl" />
      </div>

      <div className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <header className="glass-panel animate-rise rounded-3xl p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">ContextHub</h1>
              <p className="mt-1 text-sm text-muted">
                {t.subtitle}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSettingsOpen(true)}
                className="action-button"
                type="button"
              >
                <SettingsIcon className="h-4 w-4" />
                {t.settings}
              </button>
              <button
                onClick={() => void loadWorkspace(true)}
                className="action-button action-button-primary"
                type="button"
                disabled={isRefreshing || isBooting}
              >
                {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {t.rescan}
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t.totalChats} value={String(chats.length)} icon={<FolderKanban className="h-4 w-4" />} />
            <StatCard label={t.summarized} value={`${summaryCount}`} icon={<Bot className="h-4 w-4" />} />
            <StatCard label={t.connectedResources} value={`${uniqueConnectedResourceCount}`} icon={<Link2 className="h-4 w-4" />} />
            <StatCard label={t.manualLinks} value={`${manualLinkCount}`} icon={<Plus className="h-4 w-4" />} />
          </div>

          {feedback && (
            <div
              className={`mt-5 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${feedback.type === "success" ? "bg-success/15 text-success" : "bg-red-100 text-red-600"
                }`}
            >
              {feedback.type === "success" ? <WandSparkles className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {feedback.message}
            </div>
          )}
        </header>

        <main className="mt-6 grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)] items-start">
          <section className="glass-panel animate-rise rounded-3xl p-4 sm:p-5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-hidden lg:flex lg:flex-col" style={{ animationDelay: "80ms" }}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.searchPlaceholder}
                className="h-11 w-full rounded-xl border border-line bg-white/80 pl-10 pr-10 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted transition hover:bg-panel-strong hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <FilterChip
                active={sourceFilter === "all"}
                label={`${t.all} (${chats.length})`}
                onClick={() => setSourceFilter("all")}
              />
              <FilterChip
                active={sourceFilter === "cursor"}
                label={`Cursor (${chats.filter((chat) => chat.source === "cursor").length})`}
                onClick={() => setSourceFilter("cursor")}
              />
              <FilterChip
                active={sourceFilter === "codex"}
                label={`Codex (${chats.filter((chat) => chat.source === "codex").length})`}
                onClick={() => setSourceFilter("codex")}
              />
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <FilterChip active={connectionFilter === "all"} label={t.allConnections} onClick={() => setConnectionFilter("all")} />
              <FilterChip active={connectionFilter === "repo"} label="Repository" onClick={() => setConnectionFilter("repo")} />
              <FilterChip active={connectionFilter === "pr"} label="PR" onClick={() => setConnectionFilter("pr")} />
              <FilterChip active={connectionFilter === "jira"} label="Jira" onClick={() => setConnectionFilter("jira")} />
              <FilterChip active={connectionFilter === "wiki"} label="Wiki" onClick={() => setConnectionFilter("wiki")} />
            </div>

            {tagStats.length > 0 && (
              <TagFilterSection
                tagStats={tagStats}
                selectedTags={selectedTags}
                onToggleTag={toggleTag}
                onClearTags={() => setSelectedTags(new Set())}
                topCount={TOP_TAG_COUNT}
                showAll={showAllTags}
                onToggleShowAll={() => setShowAllTags((v) => !v)}
              />
            )}

            {isBooting ? (
              <div className="mt-8 flex items-center justify-center py-16 text-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="ml-2 text-sm">{t.loading}</span>
              </div>
            ) : (
              <div className="mt-5 space-y-3 overflow-y-auto pr-1 lg:flex-1 lg:min-h-0">
                {filteredChats.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-line bg-panel px-4 py-10 text-center text-sm text-muted">
                    {t.noChatsFound}
                  </div>
                )}

                {filteredChats.map((chat, index) => {
                  const chatLinks = dedupeLinks(linksByChatId[chat.id] ?? []);
                  const isSelected = chat.id === selectedChatId;

                  return (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => setSelectedChatId(chat.id)}
                      className={`chat-item animate-rise ${isSelected ? "chat-item-active" : ""}`}
                      style={{ animationDelay: `${Math.min(index * 35, 240)}ms` }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-md bg-panel-strong px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                          {chat.source}
                        </span>
                        <span className="text-[11px] text-muted">{formatDate(chat.updated_at || chat.created_at, locale, t.noDateInfo)}</span>
                      </div>

                      <h3 className="mt-2 line-clamp-2 text-left text-[15px] font-semibold text-ink">
                        {chat.title || t.untitled}
                      </h3>

                      <p className="mt-2 line-clamp-2 text-left text-sm text-muted">
                        {chat.summary || t.noSummaryHint}
                      </p>

                      <div className="mt-3 text-left text-xs text-muted">
                        {summarizeConnection(chat, chatLinks) || t.noConnectionInfo}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {parseTags(chat.tags)
                          .slice(0, 4)
                          .map((tagItem) => (
                            <span key={tagItem} className="tag-chip">
                              #{tagItem}
                            </span>
                          ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="glass-panel animate-rise rounded-3xl p-5 sm:p-6" style={{ animationDelay: "140ms" }}>
            {!selectedChat ? (
              <div className="flex h-full min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-line text-muted">
                {t.selectChat}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-2xl border border-line bg-white/80 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold leading-snug">{selectedChat.title || t.untitled}</h2>
                      <p className="mt-1 text-sm text-muted">
                        {selectedChat.workspace || t.noWorkspace} · {formatDate(selectedChat.updated_at || selectedChat.created_at, locale, t.noDateInfo)}
                      </p>
                    </div>
                    <span className="rounded-lg bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
                      {selectedChat.source.toUpperCase()}
                    </span>
                  </div>

                  {selectedChat.git_repo && (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs text-muted">
                      <Github className="h-4 w-4" />
                      {selectedChat.git_repo}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-line bg-white/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
                      <Sparkles className="h-4 w-4 text-accent" />
                      {t.aiSummaryTags}
                    </h3>
                    {hasApiKey ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleSummarize()}
                          className="action-button action-button-primary"
                          disabled={aiAction !== null}
                        >
                          {aiAction === "summary" ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                          {t.summarizeAndTag}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleGenerateTags()}
                          className="action-button"
                          disabled={aiAction !== null}
                        >
                          {aiAction === "tags" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
                          {t.regenerateTags}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSettingsOpen(true)}
                        className="action-button"
                      >
                        {t.setupApiKey}
                      </button>
                    )}
                  </div>

                  <p className="mt-4 rounded-xl bg-panel p-4 text-sm leading-relaxed text-ink">
                    {selectedChat.summary || t.noSummaryYet}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {parseTags(selectedChat.tags).length === 0 && (
                      <span className="text-sm text-muted">{t.noTags}</span>
                    )}
                    {parseTags(selectedChat.tags).map((tagItem) => (
                      <span key={tagItem} className="tag-chip group flex items-center gap-1">
                        #{tagItem}
                        <button
                          type="button"
                          onClick={() => void handleRemoveTag(tagItem)}
                          className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted/60 transition hover:bg-red-100 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <InlineTagInput onAdd={(tag) => void handleAddTag(tag)} placeholder={t.addTagPlaceholder} />
                  </div>
                </div>

                <div className="rounded-2xl border border-line bg-white/80 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
                    <ExternalLink className="h-4 w-4" />
                    {t.connectedResourcesTitle} ({selectedLinks.length})
                  </h3>

                  <div className="mt-4 space-y-2">
                    {selectedLinks.length === 0 && (
                      <div className="rounded-xl border border-dashed border-line bg-panel p-4 text-sm text-muted">
                        {t.noLinksFound}
                      </div>
                    )}

                    {selectedLinks.map((link) => (
                      <div key={link.id} className="flex items-center gap-2 rounded-xl border border-line bg-panel p-2">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white"
                          onClick={() => void handleOpenLink(link.url)}
                        >
                          <LinkTypeIcon type={link.link_type} />
                          <span className="min-w-0 flex-1 truncate text-sm text-ink">
                            {link.display_text || link.url}
                          </span>
                          <span className="rounded-md bg-white px-2 py-1 text-[10px] font-semibold uppercase text-muted">
                            {linkTypeLabel(link.link_type)}
                          </span>
                          {link.added_manually && (
                            <span className="rounded-md bg-warn/20 px-2 py-1 text-[10px] font-semibold text-warn">
                              {t.manualBadge}
                            </span>
                          )}
                          <ExternalLink className="h-3.5 w-3.5 text-muted" />
                        </button>

                        {link.added_manually && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteManualLink(link.id)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-red-50 hover:text-red-600"
                            aria-label={t.deleteManualLink}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-xl border border-line bg-white p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t.addManualLink}</p>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
                      <input
                        value={manualLinkUrl}
                        onChange={(event) => setManualLinkUrl(event.target.value)}
                        placeholder="https://..."
                        className="h-10 rounded-lg border border-line px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                      />
                      <input
                        value={manualLinkLabel}
                        onChange={(event) => setManualLinkLabel(event.target.value)}
                        placeholder={t.displayNameOptional}
                        className="h-10 rounded-lg border border-line px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                      />
                      <button
                        type="button"
                        className="action-button action-button-primary h-10"
                        onClick={() => void handleAddManualLink()}
                        disabled={isAddingLink || !manualLinkUrl.trim()}
                      >
                        {isAddingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        {t.connect}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>

      {(isRefreshing || aiAction !== null) && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-white px-6 py-4 shadow-xl">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            <span className="text-sm font-medium text-ink">
              {isRefreshing
                ? t.scanning
                : aiAction === "summary"
                  ? t.summarizing
                  : t.generatingTags}
            </span>
          </div>
        </div>
      )}

      <Settings
        isOpen={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          setHasApiKey(!!getApiKey());
        }}
      />
    </div>
  );
}

function TagFilterSection({
  tagStats,
  selectedTags,
  onToggleTag,
  onClearTags,
  topCount,
  showAll,
  onToggleShowAll,
}: {
  tagStats: { tag: string; count: number }[];
  selectedTags: Set<string>;
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  topCount: number;
  showAll: boolean;
  onToggleShowAll: () => void;
}) {
  const { t } = useLanguage();
  const popoverRef = useRef<HTMLDivElement>(null);

  const topTags = tagStats.slice(0, topCount);
  const remainingTags = tagStats.slice(topCount);
  const hasMore = remainingTags.length > 0;

  useEffect(() => {
    if (!showAll) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onToggleShowAll();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAll, onToggleShowAll]);

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <Tag className="h-3 w-3" />
          {t.tags}
        </span>

        {topTags.map(({ tag, count }) => (
          <button
            key={tag}
            type="button"
            onClick={() => onToggleTag(tag)}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${selectedTags.has(tag)
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-white/80 text-muted hover:border-accent/50 hover:text-ink"
              }`}
          >
            #{tag}
            <span className="ml-1 opacity-50">{count}</span>
          </button>
        ))}

        {hasMore && (
          <div className="relative" ref={popoverRef}>
            <button
              type="button"
              onClick={onToggleShowAll}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition flex items-center gap-1 ${showAll
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-white/80 text-muted hover:border-accent/50 hover:text-ink"
                }`}
            >
              {t.moreTags(remainingTags.length)}
              <ChevronDown className={`h-3 w-3 transition-transform ${showAll ? "rotate-180" : ""}`} />
            </button>

            {showAll && (
              <div className="absolute left-0 top-full z-20 mt-1.5 w-64 max-h-60 overflow-y-auto rounded-xl border border-line bg-white p-2 shadow-lg">
                <div className="flex flex-wrap gap-1.5">
                  {remainingTags.map(({ tag, count }) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => onToggleTag(tag)}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${selectedTags.has(tag)
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-white text-muted hover:border-accent/50 hover:text-ink"
                        }`}
                    >
                      #{tag}
                      <span className="ml-1 opacity-50">{count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {selectedTags.size > 0 && (
          <button
            type="button"
            onClick={onClearTags}
            className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-500 transition hover:bg-red-100"
          >
            <X className="inline h-3 w-3 -mt-px" /> {t.clearTagFilter}
          </button>
        )}
      </div>
    </div>
  );
}

function InlineTagInput({ onAdd, placeholder }: { onAdd: (tag: string) => void; placeholder: string }) {
  const [value, setValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => {
          setIsEditing(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className="rounded-lg border border-dashed border-line px-2.5 py-1 text-xs text-muted transition hover:border-accent hover:text-accent"
      >
        <Plus className="inline h-3 w-3 -mt-px mr-0.5" />
        {placeholder}
      </button>
    );
  }

  const submit = () => {
    if (value.trim()) {
      onAdd(value);
      setValue("");
    }
    setIsEditing(false);
  };

  return (
        <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); submit(); }
        if (e.key === "Escape") { setValue(""); setIsEditing(false); }
      }}
      onBlur={submit}
      placeholder={placeholder}
      className="h-7 w-28 rounded-lg border border-accent bg-white px-2 text-xs outline-none ring-2 ring-accent/20"
    />
  );
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${active
        ? "border-accent bg-accent-soft text-accent"
        : "border-line bg-white/80 text-muted hover:border-accent/50 hover:text-ink"
        }`}
    >
      {label}
    </button>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-white/70 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-ink">{value}</div>
    </div>
  );
}

export default App;

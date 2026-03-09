import { useEffect, useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  User, Bot, Sparkles, Loader2, GitBranch, FolderOpen,
  PanelRightOpen, PanelRightClose,
} from "lucide-react";
import type { ChatRecord, MessageRecord, LinkRecord } from "../lib/types";
import { getChatMessages, getChatLinks, updateChatSummary } from "../lib/api";
import { summarizeChat, getApiKey } from "../lib/claude";
import { LinkPanel } from "./LinkPanel";

interface ChatDetailProps {
  chat: ChatRecord;
  onSummaryUpdated: () => void;
}

export function ChatDetail({ chat, onSummaryUpdated }: ChatDetailProps) {
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setShowLinks(false);
    Promise.all([getChatMessages(chat.id), getChatLinks(chat.id)]).then(([msgs, lnks]) => {
      if (!cancelled) { setMessages(msgs); setLinks(lnks); setIsLoading(false); }
    });
    return () => { cancelled = true; };
  }, [chat.id]);

  const handleSummarize = async () => {
    if (!getApiKey()) return;
    setIsSummarizing(true);
    try {
      const result = await summarizeChat(messages);
      await updateChatSummary(chat.id, result.summary, result.tags.join(", "));
      onSummaryUpdated();
    } catch (err) { console.error(err); }
    finally { setIsSummarizing(false); }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-7 h-7 animate-spin text-blue" />
      </div>
    );
  }

  const uniqueLinks = links.filter((l, i, arr) => arr.findIndex((x) => x.url === l.url) === i);

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white border-b border-border">
          <div className="max-w-4xl mx-auto px-10 py-8">
            {/* Meta */}
            <div className="flex items-center gap-2.5 mb-4">
              <span className={`text-[12px] font-bold uppercase tracking-wide px-2.5 py-1 rounded
                ${chat.source === "cursor" ? "bg-cursor-bg text-cursor-color" : "bg-codex-bg text-codex-color"}`}>
                {chat.source}
              </span>
              {chat.workspace && (
                <span className="flex items-center gap-1.5 text-[13px] text-text-tertiary">
                  <FolderOpen className="w-3.5 h-3.5" /> {chat.workspace}
                </span>
              )}
              {chat.git_branch && (
                <span className="flex items-center gap-1.5 text-[13px] text-text-tertiary">
                  <GitBranch className="w-3.5 h-3.5" /> {chat.git_branch}
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="text-[22px] font-bold text-text leading-tight">
              {chat.title || "제목 없음"}
            </h1>

            {chat.summary && (
              <p className="text-[14px] text-text-secondary mt-3 leading-relaxed max-w-2xl">
                {chat.summary}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2.5 mt-6">
              {uniqueLinks.length > 0 && (
                <button onClick={() => setShowLinks(!showLinks)}
                  className={`flex items-center gap-2 h-9 px-4 rounded-lg text-[13px] font-medium border transition-all
                    ${showLinks
                      ? "bg-blue-light text-blue border-blue/20"
                      : "bg-white text-text-secondary border-border hover:border-blue/30 hover:text-blue"}`}>
                  {showLinks ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                  링크 {uniqueLinks.length}
                </button>
              )}
              {getApiKey() && (
                <button onClick={handleSummarize} disabled={isSummarizing}
                  className="flex items-center gap-2 h-9 px-4 rounded-lg text-[13px] font-medium
                             bg-green-light text-green border border-green/20 hover:bg-green/10 transition-all disabled:opacity-40">
                  {isSummarizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  AI 요약
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-bg">
          <div className="max-w-4xl mx-auto px-10 py-10">
            <div className="space-y-10">
              {messages.map((msg, idx) => (
                <MessageBubble key={msg.id} message={msg} index={idx} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {showLinks && uniqueLinks.length > 0 && (
        <div className="w-[320px] flex-shrink-0 border-l border-border bg-white animate-slide-in-right">
          <LinkPanel links={links} />
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, index }: { message: MessageRecord; index: number }) {
  const isUser = message.role === "user";

  return (
    <div className="animate-fade-in" style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}>
      {/* Role */}
      <div className={`flex items-center gap-2.5 mb-3 ${isUser ? "justify-end" : ""}`}>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center
          ${isUser ? "bg-blue order-2" : "bg-tag-bg"}`}>
          {isUser ? <User className="w-3.5 h-3.5 text-white" /> : <Bot className="w-3.5 h-3.5 text-text-tertiary" />}
        </div>
        <span className={`text-[13px] font-semibold ${isUser ? "text-blue order-1" : "text-text-secondary"}`}>
          {isUser ? "You" : "Assistant"}
        </span>
        {message.timestamp && (
          <span className={`text-[12px] text-text-muted ${isUser ? "order-0" : ""}`}>
            {new Date(message.timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {/* Content */}
      <div className={isUser ? "ml-auto max-w-[80%]" : "max-w-full"}>
        <div className={`rounded-2xl ${isUser
          ? "bg-user-bubble text-user-bubble-text px-6 py-4 rounded-tr-md"
          : "bg-white border border-border px-6 py-5 rounded-tl-md shadow-sm"}`}>
          <div className={`prose max-w-none ${isUser ? "text-white [&_*]:!text-white [&_code]:!text-blue-200 [&_code]:!bg-white/15" : ""}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}

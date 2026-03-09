import { useState } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import type { ChatRecord } from "../lib/types";
import { ChatCard } from "./ChatCard";

interface ChatListProps {
  chats: ChatRecord[];
  isLoading: boolean;
  onSummaryUpdated: () => void;
}

export function ChatList({ chats, isLoading, onSummaryUpdated }: ChatListProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue" />
        <span className="text-[15px] text-text-tertiary">채팅 기록을 스캔하고 있습니다...</span>
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 text-text-muted">
        <MessageSquare className="w-14 h-14 opacity-40" strokeWidth={1.2} />
        <span className="text-[16px] text-text-tertiary">채팅 기록이 없습니다</span>
        <span className="text-[14px] text-text-muted">Cursor 또는 Codex에서 대화를 시작해보세요</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {chats.map((chat, idx) => (
        <ChatCard
          key={chat.id}
          chat={chat}
          index={idx}
          isExpanded={expandedId === chat.id}
          onToggle={() => setExpandedId(expandedId === chat.id ? null : chat.id)}
          onSummaryUpdated={onSummaryUpdated}
        />
      ))}
    </div>
  );
}

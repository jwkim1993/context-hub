import type { ChatRecord, MessageRecord, LinkRecord } from "./types";

const IS_TAURI = typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (IS_TAURI) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  throw new Error("Not in Tauri");
}

function ensureHttpUrl(input: string): string {
  const value = input.trim();
  if (!value) return value;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `https://${value}`;
}

function inferLinkType(url: string): LinkRecord["link_type"] {
  if (/github\.com\/[^/]+\/[^/]+\/pull\/\d+/i.test(url)) return "github_pr";
  if (/github\.com\/[^/]+\/[^/]+\/issues\/\d+/i.test(url)) return "github_issue";
  if (/github\.com\/[^/]+\/[^/]+/i.test(url)) return "github_repo";
  if (/atlassian\.net\/browse\/[A-Z]+-\d+/i.test(url)) return "jira";
  if (/atlassian\.net\/wiki\/spaces\//i.test(url)) return "confluence";
  return "other";
}

function inferDisplayText(url: string, type: LinkRecord["link_type"]): string | null {
  const pr = url.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/i);
  if (pr) return `${pr[1]}#${pr[2]}`;

  const issue = url.match(/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/i);
  if (issue) return `${issue[1]}#${issue[2]}`;

  const repo = url.match(/github\.com\/([^/]+\/[^/]+)(?:\.git)?\/?$/i);
  if (repo && type === "github_repo") return repo[1];

  const jira = url.match(/atlassian\.net\/browse\/([A-Z]+-\d+)/i);
  if (jira) return jira[1];

  return null;
}

const MOCK_CHATS: ChatRecord[] = [
  {
    id: 1,
    source: "cursor",
    source_id: "abc-1",
    file_path: "/mock",
    title: "Chat History Manager 앱 구현",
    workspace: "context-hub",
    created_at: "2026-02-27T05:08:00Z",
    updated_at: "2026-02-27T08:00:00Z",
    summary: "Codex와 Cursor의 채팅 기록을 통합 관리하는 Tauri 데스크톱 앱을 설계하고 구현",
    tags: "tauri,react,rust,history",
    git_branch: "main",
    git_repo: "lunit-io/context-hub",
  },
  {
    id: 2,
    source: "codex",
    source_id: "abc-2",
    file_path: "/mock",
    title: "Warning: apply_patch was requested via exec_command",
    workspace: "csg-case-curator",
    created_at: "2026-02-27T03:47:00Z",
    updated_at: "2026-02-27T04:30:00Z",
    summary: "apply_patch 도구 관련 경고 해결 및 코드 리팩토링",
    tags: "bugfix,patch",
    git_branch: "feat/split-mgmt",
    git_repo: "lunit-io/csg-case-curator-backend",
  },
  {
    id: 3,
    source: "cursor",
    source_id: "abc-3",
    file_path: "/mock",
    title: "현재 breast study API가 매우 느려진 문제가 있어서 확인 필요",
    workspace: "backend",
    created_at: "2026-02-27T01:33:00Z",
    updated_at: "2026-02-27T02:00:00Z",
    summary: "API 성능 저하 원인 분석 - DB 쿼리 최적화 및 캐싱 전략 수립",
    tags: "performance,api,database",
    git_branch: null,
    git_repo: "lunit-io/csg-case-curator-backend",
  },
  {
    id: 4,
    source: "cursor",
    source_id: "abc-4",
    file_path: "/mock",
    title: "프로젝트를 새로 만들려고 해. 프로젝트의 핵심 컨셉은 메모 앱",
    workspace: "memo",
    created_at: "2026-02-27T04:14:00Z",
    updated_at: "2026-02-27T05:00:00Z",
    summary: null,
    tags: null,
    git_branch: "main",
    git_repo: null,
  },
  {
    id: 5,
    source: "codex",
    source_id: "abc-5",
    file_path: "/mock",
    title: "다른 어플리케이션들을 보면, 내가 정보를 확인하고 난 후...",
    workspace: "pr-viewer",
    created_at: "2026-02-25T10:00:00Z",
    updated_at: "2026-02-25T11:00:00Z",
    summary: "PR 리뷰 워크플로우 개선을 위한 도구 설계",
    tags: "github,pr,workflow",
    git_branch: null,
    git_repo: "lunit-io/pr-viewer",
  },
];

const MOCK_MESSAGES: MessageRecord[] = [
  {
    id: 1,
    chat_id: 1,
    role: "user",
    order_index: 0,
    timestamp: "2026-02-27T05:08:00Z",
    content:
      "내가 지금 codex, cursor를 주력으로 사용하고 있어. 그런데 여러 툴에서 구현을 병행하다 보니까, 특정 주제랑 관련된 chat이 어떤 툴에서 어디에 있는지 확인하기 힘들거든. 혹시 이런 chat history를 한 곳에서 관리할 수 있는 툴을 만들 수 있을까?",
  },
  {
    id: 2,
    chat_id: 1,
    role: "assistant",
    order_index: 1,
    timestamp: "2026-02-27T05:08:30Z",
    content:
      "충분히 가능합니다. 두 툴 모두 로컬 JSONL을 파싱해 통합 인덱싱할 수 있고, 요약/태그/외부 링크 추적 중심의 인터페이스를 만들 수 있습니다.",
  },
  {
    id: 3,
    chat_id: 1,
    role: "user",
    order_index: 2,
    timestamp: "2026-02-27T05:10:00Z",
    content:
      "보통 내가 챗 안에서 jira 티켓이랑도 연결하고, github PR이랑도 연결하거든. 이렇게 chat과 연결된 외부 링크나 툴도 같이 보여지면 좋을것같아.",
  },
];

const MOCK_LINKS: LinkRecord[] = [
  {
    id: 1,
    chat_id: 1,
    message_id: null,
    url: "https://jira.example.com/browse/AIPF-977",
    link_type: "jira",
    display_text: "AIPF-977",
    added_manually: false,
  },
  {
    id: 2,
    chat_id: 1,
    message_id: null,
    url: "https://github.com/lunit-io/csg-case-curator-backend/pull/736",
    link_type: "github_pr",
    display_text: "lunit-io/csg-case-curator-backend#736",
    added_manually: false,
  },
  {
    id: 3,
    chat_id: 2,
    message_id: null,
    url: "https://github.com/lunit-io/csg-case-curator-backend/issues/981",
    link_type: "github_issue",
    display_text: "lunit-io/csg-case-curator-backend#981",
    added_manually: true,
  },
  {
    id: 4,
    chat_id: 2,
    message_id: null,
    url: "https://github.com/lunit-io/csg-case-curator-backend",
    link_type: "github_repo",
    display_text: "lunit-io/csg-case-curator-backend",
    added_manually: false,
  },
];

let mockChatsStore: ChatRecord[] = [...MOCK_CHATS];
let mockLinksStore: LinkRecord[] = [...MOCK_LINKS];

export async function scanAllChats(): Promise<ChatRecord[]> {
  try {
    return await tauriInvoke<ChatRecord[]>("scan_all_chats");
  } catch {
    return [...mockChatsStore];
  }
}

export async function getAllChats(): Promise<ChatRecord[]> {
  try {
    return await tauriInvoke<ChatRecord[]>("get_all_chats");
  } catch {
    return [...mockChatsStore];
  }
}

export async function getAllLinks(): Promise<LinkRecord[]> {
  try {
    return await tauriInvoke<LinkRecord[]>("get_all_links");
  } catch {
    return [...mockLinksStore];
  }
}

export async function getChatMessages(chatId: number): Promise<MessageRecord[]> {
  try {
    return await tauriInvoke<MessageRecord[]>("get_chat_messages", { chatId });
  } catch {
    return MOCK_MESSAGES.filter((m) => m.chat_id === chatId);
  }
}

export async function getChatLinks(chatId: number): Promise<LinkRecord[]> {
  try {
    return await tauriInvoke<LinkRecord[]>("get_chat_links", { chatId });
  } catch {
    return mockLinksStore.filter((l) => l.chat_id === chatId);
  }
}

export async function searchChats(query: string): Promise<ChatRecord[]> {
  try {
    return await tauriInvoke<ChatRecord[]>("search_chats", { query });
  } catch {
    const q = query.trim().toLowerCase();
    if (!q) return [...mockChatsStore];

    const tokens = q.split(/\s+/).filter(Boolean);
    return mockChatsStore.filter((chat) => {
      const linkText = mockLinksStore
        .filter((link) => link.chat_id === chat.id)
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
  }
}

export async function updateChatSummary(
  chatId: number,
  summary: string,
  tags: string,
  title?: string,
): Promise<void> {
  try {
    await tauriInvoke<void>("update_chat_summary", { chatId, summary, tags, title });
  } catch {
    mockChatsStore = mockChatsStore.map((chat) =>
      chat.id === chatId ? { ...chat, summary, tags, title: title ?? chat.title } : chat,
    );
  }
}

export async function addManualLink(
  chatId: number,
  url: string,
  displayText?: string,
): Promise<LinkRecord> {
  try {
    return await tauriInvoke<LinkRecord>("add_manual_link", { chatId, url, displayText });
  } catch {
    const normalizedUrl = ensureHttpUrl(url);
    const linkType = inferLinkType(normalizedUrl);
    const created: LinkRecord = {
      id: Date.now(),
      chat_id: chatId,
      message_id: null,
      url: normalizedUrl,
      link_type: linkType,
      display_text: displayText?.trim() || inferDisplayText(normalizedUrl, linkType),
      added_manually: true,
    };
    mockLinksStore = [created, ...mockLinksStore];
    return created;
  }
}

export async function deleteManualLink(linkId: number): Promise<boolean> {
  try {
    return await tauriInvoke<boolean>("delete_manual_link", { linkId });
  } catch {
    const before = mockLinksStore.length;
    mockLinksStore = mockLinksStore.filter((link) => !(link.id === linkId && link.added_manually));
    return mockLinksStore.length < before;
  }
}

export async function openExternalUrl(url: string): Promise<void> {
  if (IS_TAURI) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

export interface ChatRecord {
  id: number;
  source: "cursor" | "codex";
  source_id: string;
  title: string | null;
  workspace: string | null;
  created_at: string | null;
  updated_at: string | null;
  file_path: string;
  summary: string | null;
  tags: string | null;
  git_branch: string | null;
  git_repo: string | null;
}

export interface MessageRecord {
  id: number;
  chat_id: number;
  role: string;
  content: string;
  timestamp: string | null;
  order_index: number;
}

export interface LinkRecord {
  id: number;
  chat_id: number;
  message_id: number | null;
  url: string;
  link_type: "github_pr" | "github_issue" | "github_repo" | "jira" | "confluence" | "other";
  display_text: string | null;
  added_manually: boolean;
}

export type SourceFilter = "all" | "cursor" | "codex";

export interface AppSettings {
  claude_api_key: string;
  cursor_path: string;
  codex_path: string;
}

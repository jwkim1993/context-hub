import type { MessageRecord } from "./types";
import { getLanguage, type Language } from "./i18n";

const STORAGE_KEY = "context-hub-claude-api-key";
const CLAUDE_ENDPOINT = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

export function getApiKey(): string {
  return localStorage.getItem(STORAGE_KEY) || "";
}

export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key);
}

function normalizeMessageContent(content: string): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\|.+\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= 420) return cleaned;
  return `${cleaned.slice(0, 420)}...`;
}

function buildConversationContext(messages: MessageRecord[]): string {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-24)
    .map((m) => `${m.role}: ${normalizeMessageContent(m.content)}`)
    .join("\n\n");
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const candidates: string[] = [trimmed];

  const fencedMatches = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/gi) || [];
  for (const block of fencedMatches) {
    const inner = block.replace(/```(?:json)?/i, "").replace(/```$/, "").trim();
    if (inner) candidates.push(inner);
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    candidates.push(trimmed.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore and continue
    }
  }

  return null;
}

function parseJsonArray(text: string): unknown[] | null {
  const trimmed = text.trim();
  const candidates: string[] = [trimmed];

  const fencedMatches = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/gi) || [];
  for (const block of fencedMatches) {
    const inner = block.replace(/```(?:json)?/i, "").replace(/```$/, "").trim();
    if (inner) candidates.push(inner);
  }

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) {
    candidates.push(trimmed.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore and continue
    }
  }

  return null;
}

function sanitizeSummary(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

function normalizeTag(raw: string): string | null {
  const cleaned = raw
    .toLowerCase()
    .replace(/^[#\s-]+/, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;

  const words = cleaned.split(" ").filter(Boolean);
  if (words.length === 0) return null;

  const tag = words.slice(0, 2).join(" ").trim();
  if (!tag) return null;
  if (tag.length > 28) return tag.slice(0, 28).trim();
  return tag;
}

function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const deduped = new Set<string>();
  for (const item of input) {
    if (typeof item !== "string") continue;
    const normalized = normalizeTag(item);
    if (!normalized) continue;
    deduped.add(normalized);
    if (deduped.size >= 4) break;
  }

  return [...deduped];
}

function summaryLanguageInstruction(lang: Language): string {
  return lang === "ko"
    ? "Write the summary in Korean (한국어)."
    : "Write the summary in English.";
}

export async function summarizeChat(
  messages: MessageRecord[],
  langOverride?: Language,
): Promise<{ summary: string; tags: string[] }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Claude API key not configured");
  }

  const lang = langOverride ?? getLanguage();
  const conversationText = buildConversationContext(messages);

  const response = await fetch(CLAUDE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 220,
      messages: [
        {
          role: "user",
          content: `You are extracting stable project memory from an AI coding conversation.
Return JSON only: {"summary":"...","tags":["..."]}.

Rules:
- ${summaryLanguageInstruction(lang)}
- Summary: 1-2 sentences.
- Keep only the core outcome: problem, root cause, and final fix/decision.
- Exclude intermediate artifacts: test failures, temporary code attempts, markdown templates, logs, stack traces, command outputs, long code/sql snippets.
- Tags: 2-4 tags, each tag must be 1-2 words in English, focusing on core domain/feature.
- Avoid long phrases and avoid copying raw transcript text.

Conversation:
${conversationText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${err}`);
  }

  const data = await response.json();
  const text = data.content[0].text;

  const parsed = parseJsonObject(text);
  if (parsed) {
    const summary = sanitizeSummary(typeof parsed.summary === "string" ? parsed.summary : "");
    return {
      summary,
      tags: sanitizeTags(parsed.tags),
    };
  }

  const summary = sanitizeSummary(text);
  return {
    summary,
    tags: [],
  };
}

export async function generateTagsFromChat(messages: MessageRecord[], _langOverride?: Language): Promise<string[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Claude API key not configured");
  }

  const conversationText = buildConversationContext(messages);

  const response = await fetch(CLAUDE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 120,
      messages: [
        {
          role: "user",
          content: `Generate core tags for this AI coding conversation.
Return JSON only: {"tags":["tag1","tag2"]}.

Rules:
- 2-4 tags only.
- Each tag must be 1 or 2 words.
- Tags must represent final/core topics only (feature, domain, bug category).
- Do not include temporary artifacts such as test failures, trial fixes, template wording, command logs.
- No explanations.

Conversation:
${conversationText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${err}`);
  }

  const data = await response.json();
  const text = data.content[0].text;

  const parsed = parseJsonObject(text);
  if (parsed) {
    return sanitizeTags(parsed.tags);
  }

  return sanitizeTags(
    text
      .split(",")
      .map((tag: string) => tag.trim())
      .filter(Boolean),
  );
}

export async function semanticSearch(
  query: string,
  chatSummaries: { id: number; title: string | null; summary: string | null; tags: string | null }[]
): Promise<number[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Claude API key not configured");
  }

  const chatList = chatSummaries
    .map(
      (c) =>
        `[ID:${c.id}] Title: ${c.title || "Untitled"} | Summary: ${c.summary || "No summary"} | Tags: ${c.tags || "none"}`
    )
    .join("\n");

  const response = await fetch(CLAUDE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `Given this search query: "${query}"

Find the most relevant chats from this list and return their IDs as a JSON array (most relevant first, max 10):

${chatList}

Respond with only the JSON array of IDs, e.g. [3, 7, 1]`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error("Claude API error");
  }

  const data = await response.json();
  const text = data.content[0].text;

  const parsed = parseJsonArray(text);
  if (!parsed) return [];
  return parsed.filter((id): id is number => typeof id === "number");
}

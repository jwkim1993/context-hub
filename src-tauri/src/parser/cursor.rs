use std::collections::HashMap;
use std::fs;
use std::path::Path;

use regex::Regex;
use rusqlite::Connection;
use serde_json::Value;
use std::sync::LazyLock;

use super::{ChatSource, ParsedChat, ParsedMessage};
use super::links::extract_links_for_role;
use super::title::derive_chat_title;

static USER_QUERY_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)<user_query>\s*(.*?)\s*</user_query>").unwrap()
});

pub fn parse_cursor_jsonl(file_path: &Path) -> Result<ParsedChat, String> {
    let content = fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let source_id = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();

    let workspace = extract_workspace_from_path(file_path);

    let metadata = fs::metadata(file_path).ok();
    let created_at = metadata
        .as_ref()
        .and_then(|m| m.created().ok())
        .map(|t| {
            chrono::DateTime::<chrono::Utc>::from(t)
                .format("%Y-%m-%dT%H:%M:%SZ")
                .to_string()
        });
    let updated_at = metadata
        .as_ref()
        .and_then(|m| m.modified().ok())
        .map(|t| {
            chrono::DateTime::<chrono::Utc>::from(t)
                .format("%Y-%m-%dT%H:%M:%SZ")
                .to_string()
        });

    let mut messages: Vec<ParsedMessage> = Vec::new();
    let mut all_links = Vec::new();
    let mut first_user_query: Option<String> = None;

    for (idx, line) in content.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parsed: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let role = parsed["role"].as_str().unwrap_or("unknown").to_string();
        let text = extract_text_content(&parsed);

        if !text.is_empty() {
            let clean_content = if role == "user" {
                extract_user_query(&text)
            } else {
                clean_assistant_text(&text)
            };

            if role == "user" && first_user_query.is_none() && !clean_content.is_empty() {
                first_user_query = Some(clean_content.clone());
            }

            let msg_links = extract_links_for_role(&text, Some(idx as i32), &role);
            all_links.extend(msg_links);

            messages.push(ParsedMessage {
                role,
                content: clean_content,
                timestamp: None,
                order_index: idx as i32,
            });
        }
    }

    let title = first_user_query
        .and_then(|q| derive_chat_title(&q))
        .or_else(|| {
            messages
                .iter()
                .filter(|m| m.role == "user")
                .find_map(|m| derive_chat_title(&m.content))
        });

    Ok(ParsedChat {
        source: ChatSource::Cursor,
        source_id,
        title,
        workspace,
        file_path: file_path.to_string_lossy().to_string(),
        created_at,
        updated_at,
        git_branch: None,
        git_repo: None,
        messages,
        links: all_links,
    })
}

fn extract_text_content(parsed: &Value) -> String {
    if let Some(content) = parsed["message"]["content"].as_array() {
        content
            .iter()
            .filter_map(|c| {
                if c["type"].as_str() == Some("text") {
                    c["text"].as_str().map(|s| s.to_string())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        String::new()
    }
}

fn extract_user_query(text: &str) -> String {
    if let Some(cap) = USER_QUERY_RE.captures(text) {
        cap[1].trim().to_string()
    } else {
        text.to_string()
    }
}

fn clean_assistant_text(text: &str) -> String {
    text.to_string()
}

fn extract_workspace_from_path(path: &Path) -> Option<String> {
    let path_str = path.to_string_lossy();
    if let Some(start) = path_str.find(".cursor/projects/") {
        let after = &path_str[start + ".cursor/projects/".len()..];
        if let Some(end) = after.find("/agent-transcripts") {
            let workspace_slug = &after[..end];
            let parts: Vec<&str> = workspace_slug.split('-').collect();
            if parts.len() >= 2 {
                return Some(parts[parts.len() - 1].to_string());
            }
            return Some(workspace_slug.to_string());
        }
    }
    None
}

pub fn load_cursor_composer_titles() -> HashMap<String, String> {
    let mut titles = HashMap::new();

    let ws_dir = dirs::home_dir()
        .unwrap_or_default()
        .join("Library/Application Support/Cursor/User/workspaceStorage");

    if !ws_dir.exists() {
        return titles;
    }

    let entries = match fs::read_dir(&ws_dir) {
        Ok(e) => e,
        Err(_) => return titles,
    };

    for entry in entries.filter_map(|e| e.ok()) {
        let db_path = entry.path().join("state.vscdb");
        if !db_path.exists() {
            continue;
        }

        if let Ok(conn) = Connection::open_with_flags(
            &db_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
        ) {
            let result: Result<String, _> = conn.query_row(
                "SELECT value FROM ItemTable WHERE key = 'composer.composerData'",
                [],
                |row| row.get(0),
            );

            if let Ok(raw) = result {
                if let Ok(data) = serde_json::from_str::<Value>(&raw) {
                    if let Some(composers) = data["allComposers"].as_array() {
                        for composer in composers {
                            let id = composer["composerId"].as_str().unwrap_or("");
                            let name = composer["name"].as_str().unwrap_or("").trim();
                            if !id.is_empty() && !name.is_empty() {
                                titles.insert(id.to_string(), name.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    titles
}

pub fn discover_cursor_chats(base_path: &Path) -> Vec<std::path::PathBuf> {
    let mut results = Vec::new();

    if !base_path.exists() {
        return results;
    }

    for entry in walkdir::WalkDir::new(base_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("jsonl")
            && path.to_string_lossy().contains("agent-transcripts")
        {
            results.push(path.to_path_buf());
        }
    }

    results
}

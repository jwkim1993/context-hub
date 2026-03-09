use std::collections::HashMap;
use std::fs;
use std::path::Path;

use serde_json::Value;

use super::{ChatSource, ParsedChat, ParsedMessage};
use super::links::extract_links_for_role;
use super::title::derive_chat_title;

pub fn parse_codex_jsonl(file_path: &Path) -> Result<ParsedChat, String> {
    let content = fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let mut session_id = String::new();
    let mut workspace: Option<String> = None;
    let mut git_branch: Option<String> = None;
    let mut git_repo: Option<String> = None;
    let mut created_at: Option<String> = None;
    let mut messages: Vec<ParsedMessage> = Vec::new();
    let mut all_links = Vec::new();
    let mut msg_index = 0i32;

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parsed: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let event_type = parsed["type"].as_str().unwrap_or("");
        let timestamp = parsed["timestamp"].as_str().map(|s| s.to_string());

        match event_type {
            "session_meta" => {
                let payload = &parsed["payload"];
                session_id = payload["id"]
                    .as_str()
                    .unwrap_or("")
                    .to_string();
                created_at = payload["timestamp"].as_str().map(|s| s.to_string());
                workspace = payload["cwd"].as_str().map(|s| {
                    Path::new(s)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or(s)
                        .to_string()
                });
                git_branch = payload["git"]["branch"].as_str().map(|s| s.to_string());
                git_repo = payload["git"]["repository_url"]
                    .as_str()
                    .map(|s| s.to_string());
            }
            "response_item" => {
                let payload = &parsed["payload"];
                let payload_type = payload["type"].as_str().unwrap_or("");

                if payload_type == "message" {
                    let role = payload["role"].as_str().unwrap_or("unknown");
                    if role == "user" || role == "assistant" {
                        let text = extract_codex_message_text(payload);
                        if !text.is_empty() {
                            let msg_links = extract_links_for_role(&text, Some(msg_index), role);
                            all_links.extend(msg_links);

                            messages.push(ParsedMessage {
                                role: role.to_string(),
                                content: text,
                                timestamp: timestamp.clone(),
                                order_index: msg_index,
                            });
                            msg_index += 1;
                        }
                    }
                }
            }
            "event_msg" => {
                let payload = &parsed["payload"];
                let payload_type = payload["type"].as_str().unwrap_or("");

                match payload_type {
                    "user_message" => {
                        let text = payload["message"].as_str().unwrap_or("").to_string();
                        if !text.is_empty() {
                            let msg_links = extract_links_for_role(&text, Some(msg_index), "user");
                            all_links.extend(msg_links);

                            messages.push(ParsedMessage {
                                role: "user".to_string(),
                                content: text,
                                timestamp: timestamp.clone(),
                                order_index: msg_index,
                            });
                            msg_index += 1;
                        }
                    }
                    "agent_message" => {
                        let text = payload["message"].as_str().unwrap_or("").to_string();
                        if !text.is_empty() {
                            let msg_links = extract_links_for_role(&text, Some(msg_index), "assistant");
                            all_links.extend(msg_links);

                            messages.push(ParsedMessage {
                                role: "assistant".to_string(),
                                content: text,
                                timestamp: timestamp.clone(),
                                order_index: msg_index,
                            });
                            msg_index += 1;
                        }
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }

    let metadata = fs::metadata(file_path).ok();
    let updated_at = metadata
        .as_ref()
        .and_then(|m| m.modified().ok())
        .map(|t| {
            chrono::DateTime::<chrono::Utc>::from(t)
                .format("%Y-%m-%dT%H:%M:%SZ")
                .to_string()
        });

    let title = messages
        .iter()
        .filter(|m| m.role == "user")
        .find_map(|m| derive_chat_title(&m.content));

    let source_id = if session_id.is_empty() {
        file_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string()
    } else {
        session_id
    };

    Ok(ParsedChat {
        source: ChatSource::Codex,
        source_id,
        title,
        workspace,
        file_path: file_path.to_string_lossy().to_string(),
        created_at,
        updated_at,
        git_branch,
        git_repo,
        messages,
        links: all_links,
    })
}

fn extract_codex_message_text(payload: &Value) -> String {
    if let Some(content) = payload["content"].as_array() {
        content
            .iter()
            .filter_map(|c| {
                let t = c["type"].as_str().unwrap_or("");
                if t == "input_text" || t == "output_text" {
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

pub fn load_codex_thread_titles() -> HashMap<String, String> {
    let mut titles = HashMap::new();

    let home = dirs::home_dir().unwrap_or_default();
    let state_path = home.join(".codex/.codex-global-state.json");

    if let Ok(content) = fs::read_to_string(&state_path) {
        if let Ok(parsed) = serde_json::from_str::<Value>(&content) {
            collect_titles_from_root(&parsed, &mut titles);
        }
    }

    titles
}

fn collect_titles_from_root(root: &Value, out: &mut HashMap<String, String>) {
    if let Some(thread_titles) = root.get("thread-titles") {
        collect_titles_from_value(thread_titles, out);
    }

    if let Some(atom_state) = root.get("electron-persisted-atom-state") {
        if let Some(thread_titles) = atom_state.get("thread-titles") {
            collect_titles_from_value(thread_titles, out);
        }
    }

    if let Some(legacy) = root.get("electron-persisted-atom-state.thread-titles") {
        collect_titles_from_value(legacy, out);
    }
}

fn collect_titles_from_value(value: &Value, out: &mut HashMap<String, String>) {
    if let Some(title_map) = value.get("titles").and_then(|v| v.as_object()) {
        for (id, title) in title_map {
            if let Some(raw) = title.as_str() {
                let trimmed = raw.trim();
                if !trimmed.is_empty() {
                    out.insert(id.clone(), trimmed.to_string());
                }
            }
        }
    }
}

pub fn discover_codex_sessions(base_path: &Path) -> Vec<std::path::PathBuf> {
    let mut results = Vec::new();

    let sessions_dir = base_path.join("sessions");
    let archived_dir = base_path.join("archived_sessions");

    for dir in [&sessions_dir, &archived_dir] {
        if !dir.exists() {
            continue;
        }
        for entry in walkdir::WalkDir::new(dir)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                results.push(path.to_path_buf());
            }
        }
    }

    results
}

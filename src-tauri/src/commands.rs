use std::sync::Mutex;
use std::sync::LazyLock;

use regex::Regex;
use tauri::State;

use crate::db::{ChatRecord, Database, LinkRecord, MessageRecord};
use crate::parser::codex::{discover_codex_sessions, load_codex_thread_titles, parse_codex_jsonl};
use crate::parser::cursor::{discover_cursor_chats, load_cursor_composer_titles, parse_cursor_jsonl};
use crate::parser::links::classify_url;

pub struct AppState {
    pub db: Database,
}

static ROLLOUT_ID_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})").unwrap()
});

#[tauri::command]
pub fn scan_all_chats(state: State<'_, Mutex<AppState>>) -> Result<Vec<ChatRecord>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;

    let cursor_base = home.join(".cursor/projects");
    let codex_base = home.join(".codex");

    let cursor_files = discover_cursor_chats(&cursor_base);
    let cursor_titles = load_cursor_composer_titles();

    for file in &cursor_files {
        match parse_cursor_jsonl(file) {
            Ok(mut chat) => {
                if let Some(title) = cursor_titles.get(&chat.source_id) {
                    chat.title = Some(title.clone());
                }
                let _ = state.db.upsert_chat(&chat);
            }
            Err(e) => {
                eprintln!("Failed to parse cursor chat {}: {}", file.display(), e);
            }
        }
    }

    let codex_files = discover_codex_sessions(&codex_base);
    let thread_titles = load_codex_thread_titles();

    for file in &codex_files {
        match parse_codex_jsonl(file) {
            Ok(mut chat) => {
                if let Some(title) = thread_titles.get(&chat.source_id) {
                    chat.title = Some(title.clone());
                } else if let Some(captured_id) = extract_rollout_id(&chat.file_path) {
                    if let Some(title) = thread_titles.get(&captured_id) {
                        chat.title = Some(title.clone());
                    }
                }
                let _ = state.db.upsert_chat(&chat);
            }
            Err(e) => {
                eprintln!("Failed to parse codex session {}: {}", file.display(), e);
            }
        }
    }

    state.db.get_all_chats()
}

#[tauri::command]
pub fn get_all_chats(state: State<'_, Mutex<AppState>>) -> Result<Vec<ChatRecord>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    state.db.get_all_chats()
}

#[tauri::command]
pub fn get_chat_messages(
    state: State<'_, Mutex<AppState>>,
    #[allow(non_snake_case)]
    chatId: i64,
) -> Result<Vec<MessageRecord>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    state.db.get_chat_messages(chatId)
}

#[tauri::command]
pub fn get_chat_links(
    state: State<'_, Mutex<AppState>>,
    #[allow(non_snake_case)]
    chatId: i64,
) -> Result<Vec<LinkRecord>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    state.db.get_chat_links(chatId)
}

#[tauri::command]
pub fn get_all_links(state: State<'_, Mutex<AppState>>) -> Result<Vec<LinkRecord>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    state.db.get_all_links()
}

#[tauri::command]
pub fn search_chats(
    state: State<'_, Mutex<AppState>>,
    query: String,
) -> Result<Vec<ChatRecord>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    if query.trim().is_empty() {
        return state.db.get_all_chats();
    }
    state.db.search_chats(&query)
}

#[tauri::command]
pub fn update_chat_summary(
    state: State<'_, Mutex<AppState>>,
    #[allow(non_snake_case)]
    chatId: i64,
    summary: String,
    tags: String,
    title: Option<String>,
) -> Result<(), String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    state
        .db
        .update_chat_summary(chatId, &summary, &tags, title.as_deref())
}

#[tauri::command]
pub fn add_manual_link(
    state: State<'_, Mutex<AppState>>,
    #[allow(non_snake_case)]
    chatId: i64,
    url: String,
    #[allow(non_snake_case)]
    displayText: Option<String>,
) -> Result<LinkRecord, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let sanitized_url = if url.trim().starts_with("http://") || url.trim().starts_with("https://") {
        url.trim().to_string()
    } else {
        format!("https://{}", url.trim())
    };

    let (link_type, inferred_text) = classify_url(&sanitized_url);
    let display_text = displayText
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or(inferred_text);

    state
        .db
        .add_manual_link(chatId, &sanitized_url, &link_type.to_string(), display_text.as_deref())
}

#[tauri::command]
pub fn delete_manual_link(
    state: State<'_, Mutex<AppState>>,
    #[allow(non_snake_case)]
    linkId: i64,
) -> Result<bool, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    state.db.delete_manual_link(linkId)
}

fn extract_rollout_id(path: &str) -> Option<String> {
    ROLLOUT_ID_RE
        .captures_iter(path)
        .last()
        .and_then(|capture| capture.get(1).map(|m| m.as_str().to_string()))
}

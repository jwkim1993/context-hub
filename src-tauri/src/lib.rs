mod commands;
mod db;
mod parser;
mod watcher;

use std::sync::Mutex;

use commands::AppState;
use db::Database;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let home = dirs::home_dir().expect("Cannot find home directory");
    let db_path = home.join(".context-hub/database.sqlite");

    let database = Database::new(&db_path).expect("Failed to initialize database");

    let app_state = Mutex::new(AppState { db: database });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::scan_all_chats,
            commands::get_all_chats,
            commands::get_chat_messages,
            commands::get_chat_links,
            commands::get_all_links,
            commands::search_chats,
            commands::update_chat_summary,
            commands::add_manual_link,
            commands::delete_manual_link,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use rusqlite::{Connection, params, params_from_iter};
use std::path::Path;
use std::sync::Mutex;

use crate::parser::ParsedChat;

pub struct Database {
    conn: Mutex<Connection>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChatRecord {
    pub id: i64,
    pub source: String,
    pub source_id: String,
    pub title: Option<String>,
    pub workspace: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub file_path: String,
    pub summary: Option<String>,
    pub tags: Option<String>,
    pub git_branch: Option<String>,
    pub git_repo: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MessageRecord {
    pub id: i64,
    pub chat_id: i64,
    pub role: String,
    pub content: String,
    pub timestamp: Option<String>,
    pub order_index: i32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LinkRecord {
    pub id: i64,
    pub chat_id: i64,
    pub message_id: Option<i64>,
    pub url: String,
    pub link_type: String,
    pub display_text: Option<String>,
    pub added_manually: bool,
}

impl Database {
    pub fn new(db_path: &Path) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create db directory: {}", e))?;
        }

        let conn = Connection::open(db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| format!("Failed to set pragmas: {}", e))?;

        let db = Database {
            conn: Mutex::new(conn),
        };
        db.create_tables()?;
        Ok(db)
    }

    fn create_tables(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS chats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,
                source_id TEXT NOT NULL,
                title TEXT,
                workspace TEXT,
                created_at TEXT,
                updated_at TEXT,
                file_path TEXT NOT NULL UNIQUE,
                summary TEXT,
                tags TEXT,
                git_branch TEXT,
                git_repo TEXT
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT,
                order_index INTEGER NOT NULL,
                FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER NOT NULL,
                message_id INTEGER,
                url TEXT NOT NULL,
                link_type TEXT NOT NULL,
                display_text TEXT,
                added_manually INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS chats_fts USING fts5(
                title,
                summary,
                tags,
                workspace,
                content='chats',
                content_rowid='id'
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                content,
                content='messages',
                content_rowid='id'
            );

            CREATE INDEX IF NOT EXISTS idx_chats_source ON chats(source);
            CREATE INDEX IF NOT EXISTS idx_chats_workspace ON chats(workspace);
            CREATE INDEX IF NOT EXISTS idx_chats_created_at ON chats(created_at);
            CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
            CREATE INDEX IF NOT EXISTS idx_links_chat_id ON links(chat_id);
            CREATE INDEX IF NOT EXISTS idx_links_link_type ON links(link_type);
            ",
        )
        .map_err(|e| format!("Failed to create tables: {}", e))?;

        self.ensure_links_schema(&conn)?;

        Ok(())
    }

    fn ensure_links_schema(&self, conn: &Connection) -> Result<(), String> {
        let mut has_added_manually = false;
        let mut stmt = conn
            .prepare("PRAGMA table_info(links)")
            .map_err(|e| format!("Failed to inspect links schema: {}", e))?;

        let columns = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| format!("Failed to read links schema: {}", e))?;

        for column in columns {
            if column.map_err(|e| e.to_string())? == "added_manually" {
                has_added_manually = true;
                break;
            }
        }

        if !has_added_manually {
            conn.execute(
                "ALTER TABLE links ADD COLUMN added_manually INTEGER NOT NULL DEFAULT 0",
                [],
            )
            .map_err(|e| format!("Failed to migrate links schema: {}", e))?;
        }

        Ok(())
    }

    pub fn upsert_chat(&self, chat: &ParsedChat) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let existing_id: Option<i64> = conn
            .query_row(
                "SELECT id FROM chats WHERE file_path = ?1",
                params![chat.file_path],
                |row| row.get(0),
            )
            .ok();

        let chat_id = if let Some(id) = existing_id {
            conn.execute(
                "UPDATE chats SET source=?1, source_id=?2, title=?3, workspace=?4, \
                 created_at=?5, updated_at=?6, git_branch=?7, git_repo=?8 WHERE id=?9",
                params![
                    chat.source.to_string(),
                    chat.source_id,
                    chat.title,
                    chat.workspace,
                    chat.created_at,
                    chat.updated_at,
                    chat.git_branch,
                    chat.git_repo,
                    id
                ],
            )
            .map_err(|e| format!("Failed to update chat: {}", e))?;

            conn.execute("DELETE FROM messages WHERE chat_id = ?1", params![id])
                .map_err(|e| format!("Failed to delete messages: {}", e))?;
            conn.execute(
                "DELETE FROM links WHERE chat_id = ?1 AND COALESCE(added_manually, 0) = 0",
                params![id],
            )
                .map_err(|e| format!("Failed to delete links: {}", e))?;

            id
        } else {
            conn.execute(
                "INSERT INTO chats (source, source_id, title, workspace, created_at, \
                 updated_at, file_path, git_branch, git_repo) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    chat.source.to_string(),
                    chat.source_id,
                    chat.title,
                    chat.workspace,
                    chat.created_at,
                    chat.updated_at,
                    chat.file_path,
                    chat.git_branch,
                    chat.git_repo,
                ],
            )
            .map_err(|e| format!("Failed to insert chat: {}", e))?;
            conn.last_insert_rowid()
        };

        for msg in &chat.messages {
            conn.execute(
                "INSERT INTO messages (chat_id, role, content, timestamp, order_index) \
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![chat_id, msg.role, msg.content, msg.timestamp, msg.order_index],
            )
            .map_err(|e| format!("Failed to insert message: {}", e))?;
        }

        for link in &chat.links {
            conn.execute(
                "INSERT INTO links (chat_id, url, link_type, display_text, added_manually) \
                 VALUES (?1, ?2, ?3, ?4, 0)",
                params![chat_id, link.url, link.link_type.to_string(), link.display_text],
            )
            .map_err(|e| format!("Failed to insert link: {}", e))?;
        }

        // Update FTS index
        if existing_id.is_some() {
            conn.execute(
                "DELETE FROM chats_fts WHERE rowid = ?1",
                params![chat_id],
            ).ok();
        }
        conn.execute(
            "INSERT INTO chats_fts (rowid, title, summary, tags, workspace) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![chat_id, chat.title, Option::<String>::None, Option::<String>::None, chat.workspace],
        ).ok();

        for msg in &chat.messages {
            let msg_id: Option<i64> = conn
                .query_row(
                    "SELECT id FROM messages WHERE chat_id=?1 AND order_index=?2",
                    params![chat_id, msg.order_index],
                    |row| row.get(0),
                )
                .ok();
            if let Some(mid) = msg_id {
                conn.execute(
                    "INSERT INTO messages_fts (rowid, content) VALUES (?1, ?2)",
                    params![mid, msg.content],
                ).ok();
            }
        }

        Ok(chat_id)
    }

    pub fn get_all_chats(&self) -> Result<Vec<ChatRecord>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, source, source_id, title, workspace, created_at, updated_at, \
                 file_path, summary, tags, git_branch, git_repo \
                 FROM chats ORDER BY COALESCE(updated_at, created_at) DESC",
            )
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let chats = stmt
            .query_map([], |row| {
                Ok(ChatRecord {
                    id: row.get(0)?,
                    source: row.get(1)?,
                    source_id: row.get(2)?,
                    title: row.get(3)?,
                    workspace: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                    file_path: row.get(7)?,
                    summary: row.get(8)?,
                    tags: row.get(9)?,
                    git_branch: row.get(10)?,
                    git_repo: row.get(11)?,
                })
            })
            .map_err(|e| format!("Failed to query chats: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(chats)
    }

    pub fn get_chat_messages(&self, chat_id: i64) -> Result<Vec<MessageRecord>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, chat_id, role, content, timestamp, order_index \
                 FROM messages WHERE chat_id = ?1 ORDER BY order_index",
            )
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let messages = stmt
            .query_map(params![chat_id], |row| {
                Ok(MessageRecord {
                    id: row.get(0)?,
                    chat_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    timestamp: row.get(4)?,
                    order_index: row.get(5)?,
                })
            })
            .map_err(|e| format!("Failed to query messages: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(messages)
    }

    pub fn get_chat_links(&self, chat_id: i64) -> Result<Vec<LinkRecord>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, chat_id, message_id, url, link_type, display_text, COALESCE(added_manually, 0) \
                 FROM links WHERE chat_id = ?1 ORDER BY COALESCE(added_manually, 0) DESC, id DESC",
            )
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let links = stmt
            .query_map(params![chat_id], |row| {
                Ok(LinkRecord {
                    id: row.get(0)?,
                    chat_id: row.get(1)?,
                    message_id: row.get(2)?,
                    url: row.get(3)?,
                    link_type: row.get(4)?,
                    display_text: row.get(5)?,
                    added_manually: row.get::<_, i64>(6)? == 1,
                })
            })
            .map_err(|e| format!("Failed to query links: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(links)
    }

    pub fn get_all_links(&self) -> Result<Vec<LinkRecord>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, chat_id, message_id, url, link_type, display_text, COALESCE(added_manually, 0) \
                 FROM links ORDER BY COALESCE(added_manually, 0) DESC, id DESC",
            )
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let links = stmt
            .query_map([], |row| {
                Ok(LinkRecord {
                    id: row.get(0)?,
                    chat_id: row.get(1)?,
                    message_id: row.get(2)?,
                    url: row.get(3)?,
                    link_type: row.get(4)?,
                    display_text: row.get(5)?,
                    added_manually: row.get::<_, i64>(6)? == 1,
                })
            })
            .map_err(|e| format!("Failed to query all links: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(links)
    }

    pub fn search_chats(&self, query: &str) -> Result<Vec<ChatRecord>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let tokens = query
            .to_lowercase()
            .split_whitespace()
            .map(|w| w.trim().to_string())
            .filter(|w| !w.is_empty())
            .collect::<Vec<_>>()
            ;

        if tokens.is_empty() {
            return self.get_all_chats();
        }

        let where_clause = tokens
            .iter()
            .map(|_| {
                "(LOWER(\
                    COALESCE(c.title, '') || ' ' || \
                    COALESCE(c.summary, '') || ' ' || \
                    COALESCE(c.tags, '') || ' ' || \
                    COALESCE(c.workspace, '') || ' ' || \
                    COALESCE(c.git_repo, '') || ' ' || \
                    COALESCE(c.git_branch, '') || ' ' || \
                    COALESCE(m.content, '') || ' ' || \
                    COALESCE(l.url, '') || ' ' || \
                    COALESCE(l.display_text, '')\
                 ) LIKE ?)"
                    .to_string()
            })
            .collect::<Vec<_>>()
            .join(" AND ");

        let mut stmt = conn
            .prepare(
                &format!(
                    "SELECT c.id, c.source, c.source_id, c.title, c.workspace, \
                 c.created_at, c.updated_at, c.file_path, c.summary, c.tags, \
                 c.git_branch, c.git_repo \
                 FROM chats c \
                 LEFT JOIN messages m ON m.chat_id = c.id \
                 LEFT JOIN links l ON l.chat_id = c.id \
                 WHERE {} \
                 GROUP BY c.id \
                 ORDER BY COALESCE(c.updated_at, c.created_at) DESC",
                    where_clause
                ),
            )
            .map_err(|e| format!("Failed to prepare search query: {}", e))?;

        let like_tokens = tokens
            .iter()
            .map(|token| format!("%{}%", token))
            .collect::<Vec<_>>();

        let chats = stmt
            .query_map(params_from_iter(like_tokens.iter()), |row| {
                Ok(ChatRecord {
                    id: row.get(0)?,
                    source: row.get(1)?,
                    source_id: row.get(2)?,
                    title: row.get(3)?,
                    workspace: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                    file_path: row.get(7)?,
                    summary: row.get(8)?,
                    tags: row.get(9)?,
                    git_branch: row.get(10)?,
                    git_repo: row.get(11)?,
                })
            })
            .map_err(|e| format!("Failed to search chats: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(chats)
    }

    pub fn add_manual_link(
        &self,
        chat_id: i64,
        url: &str,
        link_type: &str,
        display_text: Option<&str>,
    ) -> Result<LinkRecord, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO links (chat_id, message_id, url, link_type, display_text, added_manually) \
             VALUES (?1, NULL, ?2, ?3, ?4, 1)",
            params![chat_id, url, link_type, display_text],
        )
        .map_err(|e| format!("Failed to add manual link: {}", e))?;

        let link_id = conn.last_insert_rowid();

        Ok(LinkRecord {
            id: link_id,
            chat_id,
            message_id: None,
            url: url.to_string(),
            link_type: link_type.to_string(),
            display_text: display_text.map(ToOwned::to_owned),
            added_manually: true,
        })
    }

    pub fn delete_manual_link(&self, link_id: i64) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let affected = conn
            .execute(
                "DELETE FROM links WHERE id = ?1 AND COALESCE(added_manually, 0) = 1",
                params![link_id],
            )
            .map_err(|e| format!("Failed to delete manual link: {}", e))?;
        Ok(affected > 0)
    }

    pub fn update_chat_summary(
        &self,
        chat_id: i64,
        summary: &str,
        tags: &str,
        title: Option<&str>,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        if let Some(next_title) = title {
            conn.execute(
                "UPDATE chats SET summary = ?1, tags = ?2, title = ?3 WHERE id = ?4",
                params![summary, tags, next_title, chat_id],
            )
            .map_err(|e| format!("Failed to update summary/title: {}", e))?;
        } else {
            conn.execute(
                "UPDATE chats SET summary = ?1, tags = ?2 WHERE id = ?3",
                params![summary, tags, chat_id],
            )
            .map_err(|e| format!("Failed to update summary: {}", e))?;
        }

        if let Some(next_title) = title {
            conn.execute(
                "UPDATE chats_fts SET title = ?1, summary = ?2, tags = ?3 WHERE rowid = ?4",
                params![next_title, summary, tags, chat_id],
            )
            .ok();
        } else {
            conn.execute(
                "UPDATE chats_fts SET summary = ?1, tags = ?2 WHERE rowid = ?3",
                params![summary, tags, chat_id],
            )
            .ok();
        }

        Ok(())
    }

    pub fn get_indexed_file_paths(&self) -> Result<Vec<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT file_path FROM chats")
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let paths = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| format!("Failed to query paths: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(paths)
    }
}

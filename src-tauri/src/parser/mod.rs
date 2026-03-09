pub mod cursor;
pub mod codex;
pub mod links;
pub mod title;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedChat {
    pub source: ChatSource,
    pub source_id: String,
    pub title: Option<String>,
    pub workspace: Option<String>,
    pub file_path: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub git_branch: Option<String>,
    pub git_repo: Option<String>,
    pub messages: Vec<ParsedMessage>,
    pub links: Vec<ParsedLink>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ChatSource {
    Cursor,
    Codex,
}

impl std::fmt::Display for ChatSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChatSource::Cursor => write!(f, "cursor"),
            ChatSource::Codex => write!(f, "codex"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedMessage {
    pub role: String,
    pub content: String,
    pub timestamp: Option<String>,
    pub order_index: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedLink {
    pub url: String,
    pub link_type: LinkType,
    pub display_text: Option<String>,
    pub message_index: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LinkType {
    GithubPr,
    GithubIssue,
    GithubRepo,
    Jira,
    Confluence,
    Other,
}

impl std::fmt::Display for LinkType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LinkType::GithubPr => write!(f, "github_pr"),
            LinkType::GithubIssue => write!(f, "github_issue"),
            LinkType::GithubRepo => write!(f, "github_repo"),
            LinkType::Jira => write!(f, "jira"),
            LinkType::Confluence => write!(f, "confluence"),
            LinkType::Other => write!(f, "other"),
        }
    }
}

use regex::Regex;
use std::sync::LazyLock;

use super::{LinkType, ParsedLink};

static GITHUB_PR_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"https://github\.com/([^/]+/[^/]+)/pull/(\d+)").unwrap()
});

static GITHUB_ISSUE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"https://github\.com/([^/]+/[^/]+)/issues/(\d+)").unwrap()
});

static GITHUB_REPO_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(https://github\.com/([^/\s)\]]+/[^/\s)\]]+?)(?:\.git)?/?)(?:\s|$|[)\]]|[?#])",
    )
    .unwrap()
});

static JIRA_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"https://[^/]+\.atlassian\.net/browse/([A-Z]+-\d+)").unwrap()
});

static CONFLUENCE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"https://[^/]+\.atlassian\.net/wiki/spaces/([^/\s]+)(?:/pages/(\d+)(?:/([^\s)"]+))?)?"#).unwrap()
});

static URL_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"https?://[^\s<>")]+"#).unwrap()
});

static CODE_BLOCK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)```.*?```").unwrap()
});

static INLINE_CODE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"`[^`]+`").unwrap()
});

pub fn classify_url(url: &str) -> (LinkType, Option<String>) {
    if let Some(cap) = GITHUB_PR_RE.captures(url) {
        return (
            LinkType::GithubPr,
            Some(format!("{}#{}", &cap[1], &cap[2])),
        );
    }

    if let Some(cap) = GITHUB_ISSUE_RE.captures(url) {
        return (
            LinkType::GithubIssue,
            Some(format!("{}#{}", &cap[1], &cap[2])),
        );
    }

    if let Some(cap) = JIRA_RE.captures(url) {
        return (LinkType::Jira, Some(cap[1].to_string()));
    }

    if let Some(cap) = CONFLUENCE_RE.captures(url) {
        let display = if let Some(title) = cap.get(3) {
            let decoded = title.as_str().replace('+', " ").replace("%20", " ");
            format!("{}/{}", &cap[1], decoded)
        } else {
            cap[1].to_string()
        };
        return (LinkType::Confluence, Some(display));
    }

    if let Some(cap) = GITHUB_REPO_RE.captures(url) {
        return (LinkType::GithubRepo, Some(cap[2].to_string()));
    }

    (LinkType::Other, None)
}

fn looks_like_regex_or_template(url: &str) -> bool {
    if url.contains('[') || url.contains(']') || url.contains('\\') {
        return true;
    }

    if url.contains(".*") || url.contains(".+") || url.contains("\\d") || url.contains("\\w") {
        return true;
    }

    if url.contains("${") || url.contains("{{") || url.contains("<") {
        return true;
    }

    false
}

fn should_exclude_url(url: &str) -> bool {
    if looks_like_regex_or_template(url) {
        return true;
    }

    let lower = url.to_lowercase();

    if lower.contains("localhost")
        || lower.contains("127.0.0.1")
        || lower.contains("0.0.0.0")
    {
        return true;
    }

    let internal_patterns = [
        ".prod-east",
        ".prod-west",
        ".staging-",
        ".internal",
        ".local",
        ".corp.",
        "id-frontend.",
        "id-backend.",
    ];
    for p in &internal_patterns {
        if lower.contains(p) {
            return true;
        }
    }

    let noise_patterns = [
        "atlassian.com/manage-profile",
        "marketplace.visualstudio.com",
        "code.visualstudio.com",
        "plugins.jetbrains.com",
        "npmjs.com/package",
        "crates.io/crates",
        "pypi.org/project",
        "docs.rs/",
        "docs.github.com",
        "developer.mozilla.org",
        "stackoverflow.com",
        "fonts.googleapis.com",
        "cdn.jsdelivr.net",
        "unpkg.com",
        "raw.githubusercontent.com",
        "shields.io",
        "img.shields.io",
        "badge",
        "gravatar.com",
        "avatars.githubusercontent.com",
        "api.github.com",
        "registry.npmjs.org",
    ];
    for p in &noise_patterns {
        if lower.contains(p) {
            return true;
        }
    }

    false
}

fn strip_code_blocks(text: &str) -> String {
    let without_fenced = CODE_BLOCK_RE.replace_all(text, " ");
    let without_inline = INLINE_CODE_RE.replace_all(&without_fenced, " ");
    without_inline.to_string()
}

fn normalize_url(url: &str) -> String {
    if let Some(idx) = url.find('#') {
        url[..idx].to_string()
    } else {
        url.to_string()
    }
}

pub fn extract_links_for_role(text: &str, message_index: Option<i32>, role: &str) -> Vec<ParsedLink> {
    let is_assistant = role == "assistant";
    let clean_text = strip_code_blocks(text);
    let source = clean_text.as_str();

    let mut links: Vec<ParsedLink> = Vec::new();
    let mut seen_urls: std::collections::HashSet<String> = std::collections::HashSet::new();

    for cap in GITHUB_PR_RE.captures_iter(source) {
        let url = normalize_url(&cap[0]);
        if !should_exclude_url(&url) && seen_urls.insert(url.clone()) {
            links.push(ParsedLink {
                url,
                link_type: LinkType::GithubPr,
                display_text: Some(format!("{}#{}", &cap[1], &cap[2])),
                message_index,
            });
        }
    }

    for cap in GITHUB_ISSUE_RE.captures_iter(source) {
        let url = normalize_url(&cap[0]);
        if !should_exclude_url(&url) && seen_urls.insert(url.clone()) {
            links.push(ParsedLink {
                url,
                link_type: LinkType::GithubIssue,
                display_text: Some(format!("{}#{}", &cap[1], &cap[2])),
                message_index,
            });
        }
    }

    for cap in JIRA_RE.captures_iter(source) {
        let url = normalize_url(&cap[0]);
        if !should_exclude_url(&url) && seen_urls.insert(url.clone()) {
            links.push(ParsedLink {
                url,
                link_type: LinkType::Jira,
                display_text: Some(cap[1].to_string()),
                message_index,
            });
        }
    }

    for cap in CONFLUENCE_RE.captures_iter(source) {
        let url = normalize_url(&cap[0]);
        if !should_exclude_url(&url) && seen_urls.insert(url.clone()) {
            let display = if let Some(title) = cap.get(3) {
                let decoded = title.as_str().replace('+', " ").replace("%20", " ");
                format!("{}/{}", &cap[1], decoded)
            } else {
                cap[1].to_string()
            };
            links.push(ParsedLink {
                url,
                link_type: LinkType::Confluence,
                display_text: Some(display),
                message_index,
            });
        }
    }

    for cap in GITHUB_REPO_RE.captures_iter(source) {
        let url = normalize_url(&cap[1]);
        if !should_exclude_url(&url) && seen_urls.insert(url.clone()) {
            links.push(ParsedLink {
                url,
                link_type: LinkType::GithubRepo,
                display_text: Some(cap[2].to_string()),
                message_index,
            });
        }
    }

    if !is_assistant {
        for cap in URL_RE.captures_iter(source) {
            let url = normalize_url(&cap[0]);
            if !should_exclude_url(&url) && seen_urls.insert(url.clone()) {
                links.push(ParsedLink {
                    url,
                    link_type: LinkType::Other,
                    display_text: None,
                    message_index,
                });
            }
        }
    }

    links
}

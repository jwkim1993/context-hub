const MAX_TITLE_CHARS: usize = 68;

const SKIP_LINE_PREFIXES: [&str; 16] = [
    "# context from my ide setup:",
    "## active file:",
    "## open tabs:",
    "## my request for codex:",
    "## my request for cursor:",
    "<environment_context>",
    "</environment_context>",
    "<attached_files>",
    "</attached_files>",
    "<terminal_selection",
    "</terminal_selection>",
    "<code_selection",
    "</code_selection>",
    "```",
    "|---",
    "---",
];

fn truncate_chars(input: &str, limit: usize) -> String {
    let trimmed = input.trim();
    let char_count = trimmed.chars().count();
    if char_count <= limit {
        return trimmed.to_string();
    }

    let mut out = String::new();
    for ch in trimmed.chars().take(limit) {
        out.push(ch);
    }
    format!("{}...", out.trim())
}

fn clean_inline_noise(input: &str) -> String {
    input
        .replace("AGENTS.md", "")
        .replace("environment_context", "")
        .replace("```", " ")
        .replace('\t', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn extract_marked_block(text: &str, start_marker: &str, end_marker: &str) -> Option<String> {
    let start = text.find(start_marker)?;
    let content_start = start + start_marker.len();
    let remaining = &text[content_start..];
    let end_rel = remaining.find(end_marker)?;
    Some(remaining[..end_rel].trim().to_string())
}

pub fn derive_chat_title(text: &str) -> Option<String> {
    if text.trim().is_empty() {
        return None;
    }

    let mut working = text.replace('\r', "\n");

    if let Some(extracted) = extract_marked_block(&working, "<user_query>", "</user_query>") {
        working = extracted;
    } else if let Some(idx) = working.find("## My request for Codex:") {
        working = working[(idx + "## My request for Codex:".len())..].trim().to_string();
    } else if let Some(idx) = working.find("## My request for Cursor:") {
        working = working[(idx + "## My request for Cursor:".len())..].trim().to_string();
    }

    let mut candidates: Vec<String> = Vec::new();
    for raw_line in working.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with('<') || line.starts_with('@') {
            continue;
        }

        let lowered = line.to_lowercase();
        if SKIP_LINE_PREFIXES
            .iter()
            .any(|prefix| lowered.starts_with(prefix))
        {
            continue;
        }

        let normalized = clean_inline_noise(
            line.trim_start_matches("- ")
                .trim_start_matches("* ")
                .trim_start_matches("> "),
        );
        if normalized.chars().count() < 6 {
            continue;
        }
        candidates.push(normalized);
    }

    let first = candidates.first()?;
    Some(truncate_chars(first, MAX_TITLE_CHARS))
}

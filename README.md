# ContextHub

A Mac-native desktop app that unifies chat histories from Cursor and Codex into a single searchable interface.

## Why?

When using multiple AI coding tools side by side, it's hard to remember which tool holds the conversation about a specific topic. ContextHub automatically collects and indexes scattered chat logs so you can search, summarize, and track them from one place.

## Installation (macOS)

### Download

1. Go to the [Releases](https://github.com/jwkim1993/context-hub/releases) page
2. Download the latest `.dmg` file

### Install

1. Open the downloaded `.dmg` file
2. Drag **ContextHub** to the **Applications** folder
3. Since this app is not signed with an Apple Developer certificate, macOS will block it on first launch. Run the following command in Terminal to allow it:

```bash
xattr -cr /Applications/ContextHub.app
```

4. Open ContextHub from Applications

> **Note**: You only need to run the `xattr` command once after installation or update.

## Features

| Feature | Description |
|---------|-------------|
| **Auto-collection** | Parses JSONL files from Cursor (`~/.cursor/projects/`) and Codex (`~/.codex/sessions/`), extracting messages, workspace, branch, and other metadata |
| **Original titles** | Displays the original chat titles from Cursor and Codex apps |
| **Unified search** | Keyword search across titles, content, repo names, PR numbers, and Jira tickets (SQLite FTS5) |
| **AI summary + tags** | Generates conversation summaries and tags via Claude API |
| **Semantic search** | AI-powered search that understands meaning, not just keywords |
| **Link extraction** | Automatically detects GitHub PRs/Issues, Jira tickets, and Confluence wiki pages mentioned in conversations |
| **Tag management** | Auto-generated tags with inline editing — add or remove tags directly on each chat card |
| **Filtering** | Filter by source (Cursor / Codex), connection type (Repository / PR / Jira / Wiki), and tags |
| **i18n** | English and Korean language support |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Tauri v2 (Rust + WebView) |
| Frontend | React 19, TypeScript, Tailwind CSS v4 |
| Backend | Rust (rusqlite, regex, notify, walkdir) |
| Database | SQLite with FTS5 full-text search |
| AI | Claude API (Anthropic SDK) |

## Getting Started (Development)

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable)
- Tauri v2 CLI (`npm install -g @tauri-apps/cli`)

### Development

```bash
# Install dependencies
npm install

# Run the native Tauri app (parses real chat data)
npm run tauri dev

# Run frontend only in browser (uses mock data)
npm run dev
```

### Production Build

```bash
npm run tauri build
```

The built `.app` bundle is located at `src-tauri/target/release/bundle/macos/`.

### Claude API Setup

Click the **Settings** button in the top-right corner and enter your Claude API key to enable AI summarization and tag generation. The key is stored in the browser's localStorage and is only used for direct Claude API calls — it is never sent anywhere else.

## Project Structure

```
├── src/                        # React frontend
│   ├── App.tsx                 # Main layout (search, filters, chat list, detail)
│   ├── components/
│   │   ├── ChatCard.tsx        # Chat card with expandable detail view
│   │   ├── LinkPanel.tsx       # Connected resources panel
│   │   ├── Settings.tsx        # Claude API key + language settings modal
│   │   └── SearchBar.tsx       # Search with semantic search toggle
│   ├── lib/
│   │   ├── api.ts              # Tauri IPC client + mock data fallback
│   │   ├── claude.ts           # Claude API integration (summary, tags, semantic search)
│   │   ├── i18n.ts             # Internationalization definitions
│   │   ├── LanguageContext.tsx  # React context for language state
│   │   └── types.ts            # TypeScript type definitions
│   └── index.css               # Global styles (Tailwind)
│
├── src-tauri/                  # Rust backend
│   └── src/
│       ├── parser/
│       │   ├── cursor.rs       # Cursor JSONL parser + title loader
│       │   ├── codex.rs        # Codex JSONL parser + title loader
│       │   ├── links.rs        # URL extraction & classification (GitHub, Jira, Confluence)
│       │   ├── title.rs        # Chat title derivation from message content
│       │   └── mod.rs          # Data structure definitions
│       ├── db/                 # SQLite schema & CRUD operations
│       ├── watcher/            # File system watcher (notify crate)
│       ├── commands.rs         # Tauri IPC command handlers
│       └── lib.rs              # App initialization
│
├── index.html
├── package.json
└── src-tauri/
    ├── tauri.conf.json         # Tauri app configuration
    └── Cargo.toml              # Rust dependencies
```

## Data Storage

- **Database**: `~/.context-hub/database.sqlite`
- **Chat sources (read-only)**:
  - Cursor: `~/.cursor/projects/*/agent-transcripts/*.jsonl`
  - Codex: `~/.codex/sessions/*/rollout-*.jsonl`

## License

MIT

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::mpsc;

pub struct FileWatcher {
    _watcher: RecommendedWatcher,
    pub rx: mpsc::Receiver<PathBuf>,
}

impl FileWatcher {
    pub fn new(paths: Vec<PathBuf>) -> Result<Self, String> {
        let (tx, rx) = mpsc::channel();

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    for path in event.paths {
                        if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                            let _ = tx.send(path);
                        }
                    }
                }
            },
            Config::default(),
        )
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

        for path in &paths {
            if path.exists() {
                watcher
                    .watch(path, RecursiveMode::Recursive)
                    .map_err(|e| format!("Failed to watch {}: {}", path.display(), e))?;
            }
        }

        Ok(FileWatcher {
            _watcher: watcher,
            rx,
        })
    }
}

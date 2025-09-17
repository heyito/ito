use serde::{Deserialize, Serialize};
use std::io::{self, BufRead, Write};
use std::thread;

// Platform-specific modules
#[cfg(any(target_os = "windows", target_os = "linux"))]
mod cross_platform;
#[cfg(target_os = "macos")]
mod macos;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "command")]
enum Command {
    #[serde(rename = "get-text")]
    GetText {
        format: Option<String>,
        #[serde(rename = "maxLength")]
        max_length: Option<usize>,
        #[serde(rename = "requestId")]
        request_id: String,
    },
    #[serde(rename = "get-cursor-context")]
    GetCursorContext {
        #[serde(rename = "contextLength")]
        context_length: Option<usize>,
        #[serde(rename = "cutCurrentSelection")]
        cut_current_selection: Option<bool>,
        #[serde(rename = "requestId")]
        request_id: String,
    },
}

#[derive(Serialize)]
struct SelectedTextResponse {
    #[serde(rename = "requestId")]
    request_id: String,
    success: bool,
    text: Option<String>,
    error: Option<String>,
    length: usize,
}

#[derive(Serialize)]
struct CursorContextResponse {
    #[serde(rename = "requestId")]
    request_id: String,
    success: bool,
    #[serde(rename = "contextText")]
    context_text: Option<String>,
    error: Option<String>,
    length: usize,
}

fn main() {
    let (cmd_tx, cmd_rx) = crossbeam_channel::unbounded::<Command>();

    let mut command_processor = CommandProcessor::new(cmd_rx);

    // Spawn thread to read commands from stdin
    thread::spawn(move || {
        let stdin = io::stdin();
        for line in stdin.lock().lines() {
            if let Ok(l) = line {
                if l.trim().is_empty() {
                    continue;
                }
                if let Ok(command) = serde_json::from_str::<Command>(&l) {
                    if let Err(e) = cmd_tx.send(command) {
                        eprintln!(
                            "[selected-text-reader] Failed to send command to processor: {}",
                            e
                        );
                        break;
                    }
                }
            }
        }
    });

    command_processor.run();
}

struct CommandProcessor {
    cmd_rx: crossbeam_channel::Receiver<Command>,
}

impl CommandProcessor {
    fn new(cmd_rx: crossbeam_channel::Receiver<Command>) -> Self {
        CommandProcessor { cmd_rx }
    }

    fn run(&mut self) {
        while let Ok(command) = self.cmd_rx.recv() {
            match command {
                Command::GetText {
                    format: _,
                    max_length,
                    request_id,
                } => self.handle_get_text(max_length, request_id),
                Command::GetCursorContext {
                    context_length,
                    cut_current_selection,
                    request_id,
                } => self.handle_get_cursor_context(context_length, cut_current_selection, request_id),
            }
        }
    }

    fn handle_get_text(&mut self, max_length: Option<usize>, request_id: String) {
        let max_len = max_length.unwrap_or(10000);

        let response = match get_selected_text() {
            Ok(selected_text) => {
                let text = if selected_text.is_empty() {
                    None
                } else if selected_text.len() > max_len {
                    Some(selected_text.chars().take(max_len).collect())
                } else {
                    Some(selected_text)
                };

                SelectedTextResponse {
                    request_id,
                    success: true,
                    text: text.clone(),
                    error: None,
                    length: text.as_ref().map(|t| t.len()).unwrap_or(0),
                }
            }
            Err(e) => SelectedTextResponse {
                request_id,
                success: false,
                text: None,
                error: Some(format!("Failed to get selected text: {}", e)),
                length: 0,
            },
        };

        // Always respond with JSON
        match serde_json::to_string(&response) {
            Ok(json) => {
                println!("{}", json);
                if let Err(e) = io::stdout().flush() {
                    eprintln!("[selected-text-reader] Error flushing stdout: {}", e);
                }
            }
            Err(e) => {
                eprintln!(
                    "[selected-text-reader] Error serializing response to JSON: {}",
                    e
                );
            }
        }
    }

    fn handle_get_cursor_context(&mut self, context_length: Option<usize>, _cut_current_selection: Option<bool>, request_id: String) {
        let context_len = context_length.unwrap_or(10);

        let response = match get_cursor_context(context_len) {
            Ok(context_text) => {
                let text = if context_text.is_empty() {
                    None
                } else {
                    Some(context_text.clone())
                };

                CursorContextResponse {
                    request_id,
                    success: true,
                    context_text: text.clone(),
                    error: None,
                    length: text.as_ref().map(|t| t.len()).unwrap_or(0),
                }
            }
            Err(e) => CursorContextResponse {
                request_id,
                success: false,
                context_text: None,
                error: Some(format!("Failed to get cursor context: {}", e)),
                length: 0,
            },
        };

        // Always respond with JSON
        match serde_json::to_string(&response) {
            Ok(json) => {
                println!("{}", json);
                if let Err(e) = io::stdout().flush() {
                    eprintln!("[selected-text-reader] Error flushing stdout: {}", e);
                }
            }
            Err(e) => {
                eprintln!(
                    "[selected-text-reader] Error serializing response to JSON: {}",
                    e
                );
            }
        }
    }
}

// Platform-specific implementations
#[cfg(target_os = "macos")]
fn get_selected_text() -> Result<String, Box<dyn std::error::Error>> {
    macos::get_selected_text()
}

#[cfg(any(target_os = "windows", target_os = "linux"))]
fn get_selected_text() -> Result<String, Box<dyn std::error::Error>> {
    cross_platform::get_selected_text()
}

#[cfg(target_os = "macos")]
fn get_cursor_context(context_length: usize) -> Result<String, Box<dyn std::error::Error>> {
    macos::get_cursor_context(context_length)
}

#[cfg(any(target_os = "windows", target_os = "linux"))]
fn get_cursor_context(context_length: usize) -> Result<String, Box<dyn std::error::Error>> {
    cross_platform::get_cursor_context(context_length)
}

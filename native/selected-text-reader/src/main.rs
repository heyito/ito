use arboard::Clipboard;
use serde::{Deserialize, Serialize};
use std::io::{self, BufRead, Write};
use std::thread;
use std::time::Duration;

// Platform-specific modules
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

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
        for l in stdin.lock().lines().map_while(Result::ok) {
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
                } => self.handle_get_cursor_context(
                    context_length,
                    cut_current_selection,
                    request_id,
                ),
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

    fn handle_get_cursor_context(
        &mut self,
        context_length: Option<usize>,
        _cut_current_selection: Option<bool>,
        request_id: String,
    ) {
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

#[cfg(target_os = "windows")]
fn get_selected_text() -> Result<String, Box<dyn std::error::Error>> {
    windows::get_selected_text()
}

fn get_cursor_context(context_length: usize) -> Result<String, Box<dyn std::error::Error>> {
    // Use keyboard commands to get cursor context
    // This is more reliable across different applications than Accessibility API
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard init failed: {}", e))?;

    // Store original clipboard contents
    let original_clipboard = clipboard.get_text().unwrap_or_default();

    // First, get any existing selected text
    clipboard
        .clear()
        .map_err(|e| format!("Clipboard clear failed: {}", e))?;
    copy_selected_text()?;
    thread::sleep(Duration::from_millis(25));
    let selected_text = clipboard.get_text().unwrap_or_default();
    let selected_char_count = count_editor_chars(&selected_text);

    let context_text = if selected_char_count == 0 {
        // Case 1: No selected text - proceed normally with cursor context
        clipboard
            .clear()
            .map_err(|e| format!("Clipboard clear failed: {}", e))?;

        let result = select_previous_chars_and_copy(context_length, &mut clipboard);
        match result {
            Ok(precursor_text) => {
                let precursor_char_count = count_editor_chars(&precursor_text);
                // Shift right by the amount we grabbed
                if precursor_char_count > 0 {
                    let _ = shift_cursor_right_with_deselect(precursor_char_count);
                }
                precursor_text
            }
            Err(e) => format!("[ERROR] {}", e),
        }
    } else {
        // Case 2: Some text already selected - try extending by one character
        clipboard
            .clear()
            .map_err(|e| format!("Clipboard clear failed: {}", e))?;

        let result = select_previous_chars_and_copy(1, &mut clipboard);
        match result {
            Ok(extended_text) => {
                let extended_char_count = count_editor_chars(&extended_text);

                if extended_char_count < selected_char_count {
                    // Selection shrunk - undo and return empty
                    let _ = shift_cursor_right_with_deselect(1);
                    String::new()
                } else if extended_char_count == selected_char_count {
                    // Selection unchanged - return empty, no need to return cursor.
                    // Likely means we're at the edge of a textbox.
                    String::new()
                } else {
                    // Selection extended successfully - continue extending to get full
                    // context_length
                    clipboard
                        .clear()
                        .map_err(|e| format!("Clipboard clear failed: {}", e))?;

                    let full_result =
                        select_previous_chars_and_copy(context_length - 1, &mut clipboard);
                    match full_result {
                        Ok(full_context_text) => {
                            let full_context_char_count = count_editor_chars(&full_context_text);
                            // Undo by the absolute difference between original selected text and
                            // total selection
                            let chars_to_undo =
                                (full_context_char_count as i32 - selected_char_count as i32)
                                    .unsigned_abs() as usize;
                            if chars_to_undo > 0 {
                                let _ = shift_cursor_right_with_deselect(chars_to_undo);
                            }

                            // Return only the newly added context (first n characters where n is
                            // the difference)
                            let new_context_char_count =
                                full_context_char_count - selected_char_count;
                            full_context_text
                                .chars()
                                .take(new_context_char_count)
                                .collect()
                        }
                        Err(e) => format!("[ERROR] {}", e),
                    }
                }
            }
            Err(e) => format!("[ERROR] {}", e),
        }
    };

    // Always restore original clipboard
    let _ = clipboard.set_text(original_clipboard);

    Ok(context_text)
}

// Platform-specific helper functions
#[cfg(target_os = "macos")]
fn copy_selected_text() -> Result<(), Box<dyn std::error::Error>> {
    macos::native_cmd_c()
}

#[cfg(target_os = "windows")]
fn copy_selected_text() -> Result<(), Box<dyn std::error::Error>> {
    windows::copy_selected_text()
}

#[cfg(target_os = "macos")]
fn select_previous_chars_and_copy(
    char_count: usize,
    clipboard: &mut Clipboard,
) -> Result<String, Box<dyn std::error::Error>> {
    macos::select_previous_chars_and_copy(char_count, clipboard)
}

#[cfg(target_os = "windows")]
fn select_previous_chars_and_copy(
    char_count: usize,
    clipboard: &mut Clipboard,
) -> Result<String, Box<dyn std::error::Error>> {
    windows::select_previous_chars_and_copy(char_count, clipboard)
}

#[cfg(target_os = "macos")]
fn shift_cursor_right_with_deselect(char_count: usize) -> Result<(), Box<dyn std::error::Error>> {
    macos::shift_cursor_right_with_deselect(char_count)
}

#[cfg(target_os = "windows")]
fn shift_cursor_right_with_deselect(char_count: usize) -> Result<(), Box<dyn std::error::Error>> {
    windows::shift_cursor_right_with_deselect(char_count)
}

#[cfg(target_os = "macos")]
fn count_editor_chars(text: &str) -> usize {
    macos::count_editor_chars(text)
}

#[cfg(target_os = "windows")]
fn count_editor_chars(text: &str) -> usize {
    windows::count_editor_chars(text)
}

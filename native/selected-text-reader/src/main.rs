use serde::{Deserialize, Serialize};
use std::io::{self, BufRead, Write};
use std::thread;
use arboard::Clipboard;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::time::Duration;

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
                        eprintln!("[selected-text-reader] Failed to send command to processor: {}", e);
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
                eprintln!("[selected-text-reader] Error serializing response to JSON: {}", e);
            }
        }
    }
}

// =============================================================================
// Platform-specific implementations
// =============================================================================

#[cfg(target_os = "macos")]
fn get_selected_text() -> Result<String, Box<dyn std::error::Error>> {
    get_selected_text_macos()
}

#[cfg(any(target_os = "windows", target_os = "linux"))]
fn get_selected_text() -> Result<String, Box<dyn std::error::Error>> {
    get_selected_text_cross_platform()
}

// Fast macOS implementation
#[cfg(target_os = "macos")]
fn get_selected_text_macos() -> Result<String, Box<dyn std::error::Error>> {
    let mut clipboard = Clipboard::new()?;
    
    // Store original clipboard contents
    let original_clipboard = clipboard.get_text().unwrap_or_default();
    
    // Create enigo instance for keyboard simulation
    let mut enigo = Enigo::new(&Settings::default())?;
    
    // Clear clipboard to detect if copy operation worked
    clipboard.clear()?;
    
    // Perform Cmd+C to copy selected text
    enigo.key(Key::Meta, Direction::Press)?;
    enigo.key(Key::Unicode('c'), Direction::Click)?;
    enigo.key(Key::Meta, Direction::Release)?;
    
    // Small delay to ensure copy operation completes
    thread::sleep(Duration::from_millis(50));
    
    // Try to get the copied text
    let result = match clipboard.get_text() {
        Ok(text) => {
            if text.is_empty() {
                // No text was selected
                Ok(String::new())
            } else {
                Ok(text)
            }
        }
        Err(_) => {
            // Clipboard might be empty or contain non-text data
            Ok(String::new())
        }
    };
    
    // Restore original clipboard contents (fire and forget)
    let _ = clipboard.set_text(original_clipboard);
    
    result
}

// Windows/Linux implementation using utils functions
#[cfg(any(target_os = "windows", target_os = "linux"))]
fn get_selected_text_cross_platform() -> Result<String, Box<dyn std::error::Error>> {
    let mut enigo = Enigo::new(&Settings::default())?;
    get_selected_text_by_clipboard(&mut enigo, false)
}

#[cfg(any(target_os = "windows", target_os = "linux"))]
fn get_selected_text_by_clipboard(
    enigo: &mut Enigo,
    cancel_select: bool,
) -> Result<String, Box<dyn std::error::Error>> {
    let mut clipboard = Clipboard::new()?;
    
    // Store original clipboard contents
    let original_clipboard = clipboard.get_text().unwrap_or_default();
    
    // Clear clipboard to detect if copy worked
    clipboard.clear()?;
    
    // Copy selected text
    copy(enigo);
    
    // Small delay for copy operation
    thread::sleep(Duration::from_millis(100));
    
    // Get copied text
    let result = match clipboard.get_text() {
        Ok(text) => {
            if text.is_empty() {
                Ok(String::new())
            } else {
                Ok(text)
            }
        }
        Err(_) => Ok(String::new()),
    };
    
    // Cancel selection if requested
    if cancel_select {
        right_arrow_click(enigo, 1);
    }
    
    // Restore original clipboard
    let _ = clipboard.set_text(original_clipboard);
    
    result
}

#[cfg(any(target_os = "windows", target_os = "linux"))]
fn right_arrow_click(enigo: &mut Enigo, n: usize) {
    for _ in 0..n {
        let _ = enigo.key(Key::RightArrow, Direction::Click);
    }
}

#[cfg(any(target_os = "windows", target_os = "linux"))]
fn up_control_keys(enigo: &mut Enigo) {
    let _ = enigo.key(Key::Control, Direction::Release);
    let _ = enigo.key(Key::Alt, Direction::Release);
    let _ = enigo.key(Key::Shift, Direction::Release);
    let _ = enigo.key(Key::Space, Direction::Release);
    let _ = enigo.key(Key::Tab, Direction::Release);
}

#[cfg(any(target_os = "windows", target_os = "linux"))]
fn copy(enigo: &mut Enigo) {
    up_control_keys(enigo);
    
    let _ = enigo.key(Key::Control, Direction::Press);
    let _ = enigo.key(Key::Unicode('c'), Direction::Click);
    let _ = enigo.key(Key::Control, Direction::Release);
}
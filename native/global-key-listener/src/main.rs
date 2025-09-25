use chrono::Utc;
use rdev::{grab, Event, EventType, Key};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::io::{self, BufRead, Write};
use std::thread;
use std::time::Duration;

mod key_codes;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct HotkeyCombo {
    keys: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "command")]
enum Command {
    #[serde(rename = "register_hotkeys")]
    RegisterHotkeys { hotkeys: Vec<HotkeyCombo> },
}

// Global state for registered hotkeys and currently pressed keys
static mut REGISTERED_HOTKEYS: Vec<HotkeyCombo> = Vec::new();
static mut CURRENTLY_PRESSED: Vec<String> = Vec::new();

// Global state for tracking modifier keys to detect Cmd+C/Ctrl+C combinations
static mut CMD_PRESSED: bool = false;
static mut CTRL_PRESSED: bool = false;
static mut COPY_IN_PROGRESS: bool = false;

fn main() {
    // Spawn a thread to read commands from stdin
    thread::spawn(|| {
        let stdin = io::stdin();
        for line in stdin.lock().lines() {
            if let Ok(line) = line {
                match serde_json::from_str::<Command>(&line) {
                    Ok(command) => handle_command(command),
                    Err(e) => eprintln!("Error parsing command: {}", e),
                }
            }
        }
    });

    // Spawn heartbeat thread
    thread::spawn(|| {
        let mut heartbeat_id = 0u64;
        loop {
            thread::sleep(Duration::from_secs(10)); // Send heartbeat every 10 seconds

            heartbeat_id += 1;
            let heartbeat_json = json!({
                "type": "heartbeat_ping",
                "id": heartbeat_id.to_string(),
                "timestamp": Utc::now().to_rfc3339()
            });

            println!("{}", heartbeat_json);
            io::stdout().flush().unwrap();
        }
    });

    // Start grabbing events
    if let Err(error) = grab(callback) {
        eprintln!("Error: {:?}", error);
    }
}

fn handle_command(command: Command) {
    match command {
        Command::RegisterHotkeys { hotkeys } => unsafe {
            REGISTERED_HOTKEYS = hotkeys.clone();
            eprintln!("Registered {} hotkeys", REGISTERED_HOTKEYS.len());
        },
    }
    io::stdout().flush().unwrap();
}

// Check if current pressed keys match any registered hotkey
fn should_block() -> bool {
    unsafe {
        // Check each registered hotkey
        for hotkey in &REGISTERED_HOTKEYS {
            // A hotkey blocks when ALL its keys are currently pressed
            let all_pressed = hotkey
                .keys
                .iter()
                .all(|key| CURRENTLY_PRESSED.contains(key));

            let same_length = hotkey.keys.len() == CURRENTLY_PRESSED.len();

            if all_pressed && !hotkey.keys.is_empty() && same_length {
                return true;
            }
        }
        false
    }
}

fn callback(event: Event) -> Option<Event> {
    match event.event_type {
        EventType::KeyPress(key) => {
            let key_name = format!("{:?}", key);

            // Check for copy combinations before updating modifier states
            // Ignore Cmd+C (macOS) and Ctrl+C (Windows/Linux) combinations to prevent feedback loops with selected-text-reader
            if matches!(key, Key::KeyC) && unsafe { CMD_PRESSED || CTRL_PRESSED } {
                unsafe {
                    COPY_IN_PROGRESS = true;
                }
                // Still pass through the event to the system but don't output it to our listener
                return Some(event);
            }

            // Update pressed keys BEFORE checking if we should block
            unsafe {
                if !CURRENTLY_PRESSED.contains(&key_name) {
                    CURRENTLY_PRESSED.push(key_name.clone());
                }
            }

            // Track modifier key states
            if matches!(key, Key::MetaLeft | Key::MetaRight) {
                unsafe {
                    CMD_PRESSED = true;
                }
            }
            if matches!(key, Key::ControlLeft | Key::ControlRight) {
                unsafe {
                    CTRL_PRESSED = true;
                }
            }

            output_event("keydown", &key);

            // Check if we should block based on exact hotkey match
            if should_block() {
                None // Block the event from reaching the OS
            } else {
                Some(event) // Let it through
            }
        }
        EventType::KeyRelease(key) => {
            let key_name = format!("{:?}", key);

            // Update pressed keys
            unsafe {
                CURRENTLY_PRESSED.retain(|k| k != &key_name);
            }

            // Check for C key release while copy is in progress or modifiers are still held
            if matches!(key, Key::KeyC) {
                if unsafe { COPY_IN_PROGRESS || CMD_PRESSED || CTRL_PRESSED } {
                    unsafe {
                        COPY_IN_PROGRESS = false;
                    }
                    // Don't output this C key release event
                    return Some(event);
                }
            }

            // Track modifier key states
            if matches!(key, Key::MetaLeft | Key::MetaRight) {
                unsafe {
                    CMD_PRESSED = false;
                }
            }
            if matches!(key, Key::ControlLeft | Key::ControlRight) {
                unsafe {
                    CTRL_PRESSED = false;
                }
            }

            output_event("keyup", &key);

            // Always allow key release events through
            Some(event)
        }
        _ => Some(event), // Allow all other events
    }
}

fn output_event(event_type: &str, key: &Key) {
    let timestamp = Utc::now().to_rfc3339();
    let key_name = format!("{:?}", key);

    let event_json = json!({
        "type": event_type,
        "key": key_name,
        "timestamp": timestamp,
        "raw_code": key_codes::key_to_code(key)
    });

    println!("{}", event_json);
    io::stdout().flush().unwrap();
}

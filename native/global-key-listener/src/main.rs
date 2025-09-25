use chrono::Utc;
use rdev::{grab, Event, EventType, Key};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::io::{self, BufRead, Write};
use std::thread;
use std::time::Duration;

mod key_codes;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct Hotkey {
    keys: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "command")]
enum Command {
    #[serde(rename = "register_hotkeys")]
    RegisterHotkeys { hotkeys: Vec<Hotkey> },
    #[serde(rename = "clear_hotkeys")]
    ClearHotkeys,
    #[serde(rename = "get_hotkeys")]
    GetHotkeys,
}

// Global state for registered hotkeys and currently pressed keys
static mut REGISTERED_HOTKEYS: Vec<Hotkey> = Vec::new();
static mut CURRENTLY_PRESSED: Vec<String> = Vec::new();
static mut ALT_PRESSED: bool = false;

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
        Command::ClearHotkeys => unsafe {
            REGISTERED_HOTKEYS.clear();
            eprintln!("Cleared all hotkeys");
        },
        Command::GetHotkeys => unsafe {
            println!(
                "{}",
                json!({
                    "type": "registered_hotkeys",
                    "hotkeys": REGISTERED_HOTKEYS
                })
            );
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
            let all_pressed = hotkey.keys.iter().all(|key| CURRENTLY_PRESSED.contains(key));

            if all_pressed && !hotkey.keys.is_empty() {
                return true;
            }
        }
        false
    }
}

// Check if current pressed keys are potentially part of a hotkey (for early blocking)
fn is_potential_hotkey() -> bool {
    unsafe {
        // If no keys pressed, not a potential hotkey
        if CURRENTLY_PRESSED.is_empty() {
            return false;
        }

        // Only consider it a potential hotkey if we have multiple keys pressed
        // This prevents blocking single keys that happen to be part of a hotkey
        if CURRENTLY_PRESSED.len() < 2 {
            return false;
        }

        // Check if the current keys could be the start of any registered hotkey
        for hotkey in &REGISTERED_HOTKEYS {
            // Check if all currently pressed keys are part of this hotkey
            let could_be_hotkey = CURRENTLY_PRESSED.iter().all(|pressed_key| {
                hotkey.keys.contains(pressed_key)
            });

            if could_be_hotkey {
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
            if matches!(key, Key::Alt | Key::AltGr) {
                unsafe {
                    ALT_PRESSED = true;
                }
            }

            // Don't do any special Alt blocking here - let the other logic handle it
            // Alt+Tab, Alt+F4, etc. should work normally
            let should_selectively_block_alt = false;

            // Check if we should block based on current hotkey state
            let block = should_block();

            // Only block Alt combinations that would result in exact hotkey matches
            // This allows Alt+Tab, Alt+F4, etc. to work normally
            let alt_combo_block = false;

            let potential_block = is_potential_hotkey();


            output_event("keydown", &key);

            if block || potential_block || alt_combo_block || should_selectively_block_alt {
                None // Block the event from reaching the OS
            } else {
                Some(event) // Let it through
            }
        }
        EventType::KeyRelease(key) => {
            let key_name = format!("{:?}", key);


            // Check if we should block BEFORE updating state
            let was_blocking = should_block();

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
            if matches!(key, Key::Alt | Key::AltGr) {
                unsafe {
                    ALT_PRESSED = false;
                }
            }

            output_event("keyup", &key);

            // Block the release if we were blocking when the key was pressed
            if was_blocking {
                None
            } else {
                Some(event)
            }
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

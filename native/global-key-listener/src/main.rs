use chrono::Utc;
#[cfg(target_os = "windows")]
use rdev::{grab, simulate, Event, EventType, Key};
#[cfg(not(target_os = "windows"))]
use rdev::{grab, Event, EventType, Key};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::io::{self, BufRead, Write};
use std::thread;
use std::time::Duration;

mod key_codes;

#[cfg(target_os = "macos")]
use cocoa::base::{id, nil};
#[cfg(target_os = "macos")]
use cocoa::foundation::{NSProcessInfo, NSString};
#[cfg(target_os = "macos")]
use objc::{msg_send, sel, sel_impl};

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
#[allow(static_mut_refs)]
static mut REGISTERED_HOTKEYS: Vec<HotkeyCombo> = Vec::new();
#[allow(static_mut_refs)]
static mut CURRENTLY_PRESSED: Vec<String> = Vec::new();

// Global state for tracking modifier keys to detect Cmd+C/Ctrl+C combinations
#[allow(static_mut_refs)]
static mut CMD_PRESSED: bool = false;
#[allow(static_mut_refs)]
static mut CTRL_PRESSED: bool = false;
#[allow(static_mut_refs)]
static mut COPY_IN_PROGRESS: bool = false;

/// Prevents macOS App Nap from suspending this process.
/// Returns an activity token that must be retained for the entire process
/// lifetime. On non-macOS platforms, returns a dummy value.
#[cfg(target_os = "macos")]
fn prevent_app_nap() -> id {
    unsafe {
        let process_info = NSProcessInfo::processInfo(nil);
        let reason = NSString::alloc(nil)
            .init_str("Keyboard event monitoring requires continuous operation");

        // NSActivityOptions flags:
        // NSActivityUserInitiated = 0x00FFFFFF (includes all protective flags)
        // This prevents App Nap and idle system sleep
        let options: u64 = 0x00FFFFFF;

        let activity: id = msg_send![process_info, beginActivityWithOptions:options reason:reason];

        eprintln!("macOS App Nap prevention enabled for keyboard listener process");
        activity
    }
}

#[cfg(not(target_os = "macos"))]
fn prevent_app_nap() {
    // No-op on non-macOS platforms
}

fn main() {
    // Prevent macOS App Nap from suspending this process
    // Must retain this for the entire process lifetime
    #[allow(clippy::let_unit_value)]
    let _activity = prevent_app_nap();
    // Spawn a thread to read commands from stdin
    thread::spawn(|| {
        let stdin = io::stdin();
        for line in stdin.lock().lines().map_while(Result::ok) {
            match serde_json::from_str::<Command>(&line) {
                Ok(command) => handle_command(command),
                Err(e) => eprintln!("Error parsing command: {}", e),
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
            // Ignore Cmd+C (macOS) and Ctrl+C (Windows/Linux) combinations to prevent
            // feedback loops with selected-text-reader
            if matches!(key, Key::KeyC) && unsafe { CMD_PRESSED || CTRL_PRESSED } {
                unsafe {
                    COPY_IN_PROGRESS = true;
                }
                // Still pass through the event to the system but don't output it to our
                // listener
                return Some(event);
            }

            // Update pressed keys BEFORE checking if we should block
            // Normalize Unknown(179) to Function for detection purposes
            let normalized_key = if key_name == "Unknown(179)" {
                "Function".to_string()
            } else {
                key_name.clone()
            };

            unsafe {
                if !CURRENTLY_PRESSED.contains(&normalized_key) {
                    CURRENTLY_PRESSED.push(normalized_key);
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
            #[allow(clippy::if_same_then_else)]
            if should_block() {
                // Windows-specific: Prevent Start menu from opening when Windows key is used in
                // hotkeys Windows shows the Start menu if it sees "Win down →
                // Win up" with no other keys in between. By injecting a
                // harmless key (VK 0xFF), we "poison" the sequence so Windows thinks
                // it was a combo, not a standalone Windows key press
                #[cfg(target_os = "windows")]
                unsafe {
                    if CMD_PRESSED
                        || CURRENTLY_PRESSED
                            .iter()
                            .any(|k| k == "MetaLeft" || k == "MetaRight")
                    {
                        // VK 0xFF is documented as "no mapping" - a valid key code with no function
                        let _ = simulate(&EventType::KeyPress(Key::Unknown(0xFF)));
                        let _ = simulate(&EventType::KeyRelease(Key::Unknown(0xFF)));
                    }
                }
                None // Block the event from reaching the OS
            } else if key_name == "Unknown(179)"
                && unsafe {
                    REGISTERED_HOTKEYS
                        .iter()
                        .any(|hotkey| hotkey.keys.contains(&"Function".to_string()))
                }
            {
                None // Block Unknown(179) if any hotkey uses Function
            } else {
                Some(event) // Let it through
            }
        }
        EventType::KeyRelease(key) => {
            let key_name = format!("{:?}", key);

            // Normalize Unknown(179) to Function for detection purposes
            let normalized_key = if key_name == "Unknown(179)" {
                "Function".to_string()
            } else {
                key_name.clone()
            };

            // Update pressed keys
            unsafe {
                CURRENTLY_PRESSED.retain(|k| k != &normalized_key);
            }

            // Check for C key release while copy is in progress or modifiers are still held
            if matches!(key, Key::KeyC)
                && unsafe { COPY_IN_PROGRESS || CMD_PRESSED || CTRL_PRESSED }
            {
                unsafe {
                    COPY_IN_PROGRESS = false;
                }
                // Don't output this C key release event
                return Some(event);
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

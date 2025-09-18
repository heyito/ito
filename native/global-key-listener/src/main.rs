use chrono::Utc;
use rdev::{grab, Event, EventType, Key};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::io::{self, BufRead, Write};
use std::thread;
use std::time::{Duration, Instant};

mod key_codes;

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "command")]
enum Command {
    #[serde(rename = "block")]
    Block { keys: Vec<String> },
    #[serde(rename = "unblock")]
    Unblock { key: String },
    #[serde(rename = "get_blocked")]
    GetBlocked,
}

// Global state for blocked keys
static mut BLOCKED_KEYS: Vec<String> = Vec::new();

// Global state for tracking modifier keys to detect Cmd+C/Ctrl+C combinations
static mut CMD_PRESSED: bool = false;
static mut CTRL_PRESSED: bool = false;
static mut COPY_IN_PROGRESS: bool = false;
static mut SHIFT_PRESSED: bool = false;
static mut TEXT_SELECTION_IN_PROGRESS: bool = false;
static mut LAST_ARROW_KEY_TIME: Option<std::time::Instant> = None;
static mut COPY_OPERATION_END_TIME: Option<std::time::Instant> = None;

// Helper function to check if we're still in the copy protection window
fn is_copy_protection_active() -> bool {
    unsafe {
        if COPY_IN_PROGRESS {
            return true;
        }

        // Also protect for 100ms after copy operation ends (reduced to avoid blocking legitimate paste operations)
        if let Some(end_time) = COPY_OPERATION_END_TIME {
            return Instant::now().duration_since(end_time) < Duration::from_millis(100);
        }

        false
    }
}

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
        Command::Block { keys } => unsafe {
            BLOCKED_KEYS = keys;
        },
        Command::Unblock { key } => unsafe {
            BLOCKED_KEYS.retain(|k| k != &key);
        },
        Command::GetBlocked => unsafe {
            println!(
                "{}",
                json!({
                    "type": "blocked_keys",
                    "keys": BLOCKED_KEYS
                })
            );
        },
    }
    io::stdout().flush().unwrap();
}

fn callback(event: Event) -> Option<Event> {
    match event.event_type {
        EventType::KeyPress(key) => {
            let key_name = format!("{:?}", key);
            let should_block = unsafe { BLOCKED_KEYS.contains(&key_name) };

            // Debug: Log ALL key press events on Windows to track everything
            #[cfg(target_os = "windows")]
            {
                let debug_json = json!({
                    "type": "debug_log",
                    "message": format!("KEY PRESS: {:?} | CTRL_PRESSED={} | CMD_PRESSED={} | COPY_IN_PROGRESS={} | should_block={}",
                        key, unsafe { CTRL_PRESSED }, unsafe { CMD_PRESSED }, unsafe { COPY_IN_PROGRESS }, should_block)
                });
                println!("{}", debug_json);
                io::stdout().flush().unwrap();
            }

            // Check for copy/paste combinations before updating modifier states
            // Ignore Cmd+C/Ctrl+C (copy) and Cmd+V/Ctrl+V (paste) combinations to prevent feedback loops
            if (matches!(key, Key::KeyC) || matches!(key, Key::KeyV)) && unsafe { CMD_PRESSED || CTRL_PRESSED } {
                // Send debug log through stdout so Electron can see it
                #[cfg(target_os = "windows")]
                let debug_json = json!({
                    "type": "debug_log",
                    "message": format!("Detected Ctrl+{:?} on Windows, ignoring to prevent feedback loop (CMD_PRESSED={}, CTRL_PRESSED={})", key, unsafe { CMD_PRESSED }, unsafe { CTRL_PRESSED })
                });
                #[cfg(not(target_os = "windows"))]
                let debug_json = json!({
                    "type": "debug_log",
                    "message": format!("Detected Ctrl+{:?}/Cmd+{:?}, ignoring to prevent feedback loop", key, key)
                });
                println!("{}", debug_json);
                io::stdout().flush().unwrap();

                unsafe {
                    COPY_IN_PROGRESS = true;
                }
                // Still pass through the event to the system but don't output it to our listener
                return Some(event);
            }

            // Ignore Control key events during copy operations to prevent interference
            if matches!(key, Key::ControlLeft | Key::ControlRight) && is_copy_protection_active() {
                #[cfg(target_os = "windows")]
                {
                    let debug_json = json!({
                        "type": "debug_log",
                        "message": format!("Ignoring Control key PRESS during copy protection window: {:?} (COPY_IN_PROGRESS={}, protection_active={})", key, unsafe { COPY_IN_PROGRESS }, is_copy_protection_active())
                    });
                    println!("{}", debug_json);
                    io::stdout().flush().unwrap();
                }
                // Don't update CTRL_PRESSED state and don't output this event
                return Some(event);
            }

            // Debug: Log Control key events on Windows
            #[cfg(target_os = "windows")]
            if matches!(key, Key::ControlLeft | Key::ControlRight) {
                let debug_json = json!({
                    "type": "debug_log",
                    "message": format!("Control key PRESS detected: {:?}, CTRL_PRESSED before update={}", key, unsafe { CTRL_PRESSED })
                });
                println!("{}", debug_json);
                io::stdout().flush().unwrap();
            }

            // Detect text selection patterns (Shift + Arrow keys) from selected-text-reader
            if matches!(key, Key::LeftArrow | Key::RightArrow) && unsafe { SHIFT_PRESSED } {
                unsafe {
                    let now = Instant::now();

                    // If this is part of a rapid sequence of arrow keys (likely from text selection),
                    // don't output it to prevent spam during context selection
                    if let Some(last_time) = LAST_ARROW_KEY_TIME {
                        if now.duration_since(last_time) < Duration::from_millis(50) {
                            TEXT_SELECTION_IN_PROGRESS = true;
                            LAST_ARROW_KEY_TIME = Some(now);
                            // Pass through but don't output
                            return Some(event);
                        }
                    }

                    LAST_ARROW_KEY_TIME = Some(now);
                }
            }

            // Track modifier key states AFTER checking for combinations
            if matches!(key, Key::MetaLeft | Key::MetaRight) {
                unsafe {
                    CMD_PRESSED = true;
                }
            }
            if matches!(key, Key::ControlLeft | Key::ControlRight) {
                unsafe {
                    CTRL_PRESSED = true;
                }

                // Debug: Log Control key state after update on Windows
                #[cfg(target_os = "windows")]
                {
                    let debug_json = json!({
                        "type": "debug_log",
                        "message": format!("Control key state updated to CTRL_PRESSED=true after {:?} press", key)
                    });
                    println!("{}", debug_json);
                    io::stdout().flush().unwrap();
                }
            }
            if matches!(key, Key::ShiftLeft | Key::ShiftRight) {
                unsafe {
                    SHIFT_PRESSED = true;
                }
            }

            output_event("keydown", &key);

            match should_block {
                true => None,
                false => Some(event),
            }
        }
        EventType::KeyRelease(key) => {
            let key_name = format!("{:?}", key);
            let should_block = unsafe { BLOCKED_KEYS.contains(&key_name) };

            // Debug: Log ALL key release events on Windows to track everything
            #[cfg(target_os = "windows")]
            {
                let debug_json = json!({
                    "type": "debug_log",
                    "message": format!("KEY RELEASE: {:?} | CTRL_PRESSED={} | CMD_PRESSED={} | COPY_IN_PROGRESS={} | should_block={}",
                        key, unsafe { CTRL_PRESSED }, unsafe { CMD_PRESSED }, unsafe { COPY_IN_PROGRESS }, should_block)
                });
                println!("{}", debug_json);
                io::stdout().flush().unwrap();
            }

            // Check for C/V key release while copy/paste is in progress or modifiers are still held
            if matches!(key, Key::KeyC) || matches!(key, Key::KeyV) {
                if unsafe { COPY_IN_PROGRESS || CMD_PRESSED || CTRL_PRESSED } {
                    // Send debug log for C/V key release during copy/paste operation
                    #[cfg(target_os = "windows")]
                    let debug_json = json!({
                        "type": "debug_log",
                        "message": format!("{:?} key RELEASE during copy/paste operation - ignoring (COPY_IN_PROGRESS={}, CMD_PRESSED={}, CTRL_PRESSED={})", key, unsafe { COPY_IN_PROGRESS }, unsafe { CMD_PRESSED }, unsafe { CTRL_PRESSED })
                    });
                    #[cfg(not(target_os = "windows"))]
                    let debug_json = json!({
                        "type": "debug_log",
                        "message": format!("{:?} key RELEASE during copy/paste operation - ignoring", key)
                    });
                    println!("{}", debug_json);
                    io::stdout().flush().unwrap();

                    unsafe {
                        COPY_IN_PROGRESS = false;
                        COPY_OPERATION_END_TIME = Some(Instant::now());
                    }
                    // Don't output this C key release event
                    return Some(event);
                }
            }

            // Ignore Control key release events during copy operations to prevent interference
            if matches!(key, Key::ControlLeft | Key::ControlRight) && is_copy_protection_active() {
                #[cfg(target_os = "windows")]
                {
                    let debug_json = json!({
                        "type": "debug_log",
                        "message": format!("Ignoring Control key RELEASE during copy protection window: {:?} (COPY_IN_PROGRESS={}, protection_active={})", key, unsafe { COPY_IN_PROGRESS }, is_copy_protection_active())
                    });
                    println!("{}", debug_json);
                    io::stdout().flush().unwrap();
                }
                // Don't update CTRL_PRESSED state and don't output this event
                return Some(event);
            }

            // Debug: Log Control key release events on Windows
            #[cfg(target_os = "windows")]
            if matches!(key, Key::ControlLeft | Key::ControlRight) {
                let debug_json = json!({
                    "type": "debug_log",
                    "message": format!("Control key RELEASE detected: {:?}, CTRL_PRESSED before update={}", key, unsafe { CTRL_PRESSED })
                });
                println!("{}", debug_json);
                io::stdout().flush().unwrap();
            }

            // Track modifier key states AFTER checking for combinations
            if matches!(key, Key::MetaLeft | Key::MetaRight) {
                unsafe {
                    CMD_PRESSED = false;
                }
            }
            if matches!(key, Key::ControlLeft | Key::ControlRight) {
                unsafe {
                    CTRL_PRESSED = false;
                }

                // Debug: Log Control key state after release update on Windows
                #[cfg(target_os = "windows")]
                {
                    let debug_json = json!({
                        "type": "debug_log",
                        "message": format!("Control key state updated to CTRL_PRESSED=false after {:?} release", key)
                    });
                    println!("{}", debug_json);
                    io::stdout().flush().unwrap();
                }
            }
            if matches!(key, Key::ShiftLeft | Key::ShiftRight) {
                unsafe {
                    SHIFT_PRESSED = false;
                    // Reset text selection state when shift is released
                    TEXT_SELECTION_IN_PROGRESS = false;
                }
            }

            output_event("keyup", &key);

            // CRITICAL: Always allow key release events to reach the OS
            // Blocking release events causes keys to get stuck in pressed state
            // Only block key press events, never block key release events
            Some(event)
        }
        _ => Some(event), // Allow all other events
    }
}

fn output_event(event_type: &str, key: &Key) {
    let timestamp = Utc::now().to_rfc3339();
    let key_name = format!("{:?}", key);

    // Debug: Log when we're about to output a key event to keyboard.ts
    #[cfg(target_os = "windows")]
    {
        let debug_json = json!({
            "type": "debug_log",
            "message": format!("OUTPUTTING to keyboard.ts: {} {:?} | CTRL_PRESSED={} | COPY_IN_PROGRESS={}",
                event_type, key, unsafe { CTRL_PRESSED }, unsafe { COPY_IN_PROGRESS })
        });
        println!("{}", debug_json);
        io::stdout().flush().unwrap();
    }

    let event_json = json!({
        "type": event_type,
        "key": key_name,
        "timestamp": timestamp,
        "raw_code": key_codes::key_to_code(key)
    });

    println!("{}", event_json);
    io::stdout().flush().unwrap();
}

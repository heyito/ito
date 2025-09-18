use chrono::Utc;
use rdev::{grab, Event, EventType, Key};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::io::{self, BufRead, Write};
use std::thread;
use std::time::{Duration, Instant};
use std::fs::OpenOptions;
use std::sync::Mutex;

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
    #[serde(rename = "set_hotkey_active")]
    SetHotkeyActive,
    #[serde(rename = "set_hotkey_inactive")]
    SetHotkeyInactive,
}

// Global state for blocked keys
static mut BLOCKED_KEYS: Vec<String> = Vec::new();

// Global state for hotkey activity (controlled by Electron)
static mut HOTKEY_ACTIVE: bool = false;

// Global log file for debugging
lazy_static::lazy_static! {
    static ref LOG_FILE: Mutex<std::fs::File> = {
        let log_path = std::env::current_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("."))
            .join("global-key-listener-debug.log");

        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .expect("Failed to create log file");

        println!("🚀 Debug log file created at: {}", log_path.display());
        Mutex::new(file)
    };
}

// Global state for tracking modifier keys to detect Cmd+C/Ctrl+C combinations
static mut CMD_PRESSED: bool = false;
static mut CTRL_PRESSED: bool = false;
static mut SHIFT_PRESSED: bool = false;
static mut TEXT_SELECTION_IN_PROGRESS: bool = false;
static mut LAST_ARROW_KEY_TIME: Option<std::time::Instant> = None;

// Helper function to write to log file
fn log_to_file(message: &str) {
    if let Ok(mut file) = LOG_FILE.lock() {
        let timestamp = Utc::now().to_rfc3339();
        let _ = writeln!(file, "[{}] {}", timestamp, message);
        let _ = file.flush();
    }
}

fn main() {
    log_to_file("🚀 Global key listener starting up...");

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
        Command::SetHotkeyActive => unsafe {
            HOTKEY_ACTIVE = true;
            log_to_file("✅ COMMAND: SetHotkeyActive - Hotkey is now ACTIVE, will ignore copy operations");
            #[cfg(target_os = "windows")]
            {
                let debug_json = json!({
                    "type": "debug_log",
                    "message": "Hotkey set to ACTIVE - will ignore copy operations"
                });
                println!("{}", debug_json);
                io::stdout().flush().unwrap();
            }
        },
        Command::SetHotkeyInactive => unsafe {
            HOTKEY_ACTIVE = false;
            log_to_file("❌ COMMAND: SetHotkeyInactive - Hotkey is now INACTIVE, will process copy operations normally");
            #[cfg(target_os = "windows")]
            {
                let debug_json = json!({
                    "type": "debug_log",
                    "message": "Hotkey set to INACTIVE - will process copy operations normally"
                });
                println!("{}", debug_json);
                io::stdout().flush().unwrap();
            }
        },
    }
    io::stdout().flush().unwrap();
}

fn callback(event: Event) -> Option<Event> {
    match event.event_type {
        EventType::KeyPress(key) => {
            let key_name = format!("{:?}", key);
            let should_block = unsafe { BLOCKED_KEYS.contains(&key_name) };

            // Log ALL key events to file for debugging
            log_to_file(&format!("⬇️ KEY PRESS: {:?} | HOTKEY_ACTIVE={} | CTRL_PRESSED={} | CMD_PRESSED={} | should_block={}",
                key, unsafe { HOTKEY_ACTIVE }, unsafe { CTRL_PRESSED }, unsafe { CMD_PRESSED }, should_block));

            // Debug: Log ALL key press events on Windows to track everything
            #[cfg(target_os = "windows")]
            {
                let debug_json = json!({
                    "type": "debug_log",
                    "message": format!("KEY PRESS: {:?} | HOTKEY_ACTIVE={} | CTRL_PRESSED={} | CMD_PRESSED={} | should_block={}",
                        key, unsafe { HOTKEY_ACTIVE }, unsafe { CTRL_PRESSED }, unsafe { CMD_PRESSED }, should_block)
                });
                println!("{}", debug_json);
                io::stdout().flush().unwrap();
            }

            // If hotkey is active, ignore copy operations (don't send to hotkey detection)
            let is_copy_operation = (matches!(key, Key::KeyC) || matches!(key, Key::KeyV)) && unsafe { CMD_PRESSED || CTRL_PRESSED };
            let should_ignore_copy = unsafe { HOTKEY_ACTIVE } && is_copy_operation;

            if should_ignore_copy {
                log_to_file(&format!("🚫 HOTKEY ACTIVE: Ignoring Ctrl+{:?} copy operation (not sending to hotkey detection)", key));
                #[cfg(target_os = "windows")]
                {
                    let debug_json = json!({
                        "type": "debug_log",
                        "message": format!("Hotkey is ACTIVE - ignoring Ctrl+{:?} copy operation (not sending to hotkey detection)", key)
                    });
                    println!("{}", debug_json);
                    io::stdout().flush().unwrap();
                }
                // Don't send to hotkey detection, but always pass to OS
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

            // Log copy operations that are being sent to hotkey detection
            if is_copy_operation {
                log_to_file(&format!("📋 HOTKEY INACTIVE: Sending Ctrl+{:?} to hotkey detection (normal behavior)", key));
            }

            // Always send to hotkey detection (copy operations are handled above)
            log_to_file(&format!("📤 SENDING TO HOTKEY: keydown {:?}", key));
            output_event("keydown", &key);

            match should_block {
                true => None,
                false => Some(event),
            }
        }
        EventType::KeyRelease(key) => {
            let key_name = format!("{:?}", key);
            let should_block = unsafe { BLOCKED_KEYS.contains(&key_name) };

            // Log ALL key events to file for debugging
            log_to_file(&format!("⬆️ KEY RELEASE: {:?} | HOTKEY_ACTIVE={} | CTRL_PRESSED={} | CMD_PRESSED={} | should_block={}",
                key, unsafe { HOTKEY_ACTIVE }, unsafe { CTRL_PRESSED }, unsafe { CMD_PRESSED }, should_block));

            // Debug: Log ALL key release events on Windows to track everything
            #[cfg(target_os = "windows")]
            {
                let debug_json = json!({
                    "type": "debug_log",
                    "message": format!("KEY RELEASE: {:?} | HOTKEY_ACTIVE={} | CTRL_PRESSED={} | CMD_PRESSED={} | should_block={}",
                        key, unsafe { HOTKEY_ACTIVE }, unsafe { CTRL_PRESSED }, unsafe { CMD_PRESSED }, should_block)
                });
                println!("{}", debug_json);
                io::stdout().flush().unwrap();
            }

            // If hotkey is active, ignore copy operations (don't send to hotkey detection)
            let is_copy_operation = (matches!(key, Key::KeyC) || matches!(key, Key::KeyV)) && unsafe { CMD_PRESSED || CTRL_PRESSED };
            let should_ignore_copy = unsafe { HOTKEY_ACTIVE } && is_copy_operation;

            if should_ignore_copy {
                log_to_file(&format!("🚫 HOTKEY ACTIVE: Ignoring Ctrl+{:?} RELEASE copy operation (not sending to hotkey detection)", key));
                #[cfg(target_os = "windows")]
                {
                    let debug_json = json!({
                        "type": "debug_log",
                        "message": format!("Hotkey is ACTIVE - ignoring Ctrl+{:?} RELEASE copy operation (not sending to hotkey detection)", key)
                    });
                    println!("{}", debug_json);
                    io::stdout().flush().unwrap();
                }
                // Don't send to hotkey detection, but always pass to OS
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

            // Log copy operations that are being sent to hotkey detection
            if is_copy_operation {
                log_to_file(&format!("📋 HOTKEY INACTIVE: Sending Ctrl+{:?} RELEASE to hotkey detection (normal behavior)", key));
            }

            // Always send to hotkey detection (copy operations are handled above)
            log_to_file(&format!("📤 SENDING TO HOTKEY: keyup {:?}", key));
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
            "message": format!("OUTPUTTING to keyboard.ts: {} {:?} | CTRL_PRESSED={} | HOTKEY_ACTIVE={}",
                event_type, key, unsafe { CTRL_PRESSED }, unsafe { HOTKEY_ACTIVE })
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

use chrono::Utc;
use rdev::{grab, Event, EventType, Key};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::io::{self, BufRead, Write};
use std::thread;

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

            output_event("keydown", &key);

            match should_block {
                true => None,
                false => Some(event),
            }
        }
        EventType::KeyRelease(key) => {
            let key_name = format!("{:?}", key);
            let should_block = unsafe { BLOCKED_KEYS.contains(&key_name) };

            output_event("keyup", &key);

            match should_block {
                true => None,
                false => Some(event),
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

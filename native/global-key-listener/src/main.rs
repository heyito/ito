use chrono::Utc;
use rdev::{grab, Event, EventType, Key};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::io::{self, BufRead, Write};
use std::thread;

#[derive(Debug, Serialize, Deserialize)]
struct BlockConfig {
    keys: Vec<String>,
}

// Global state for blocked keys
static mut BLOCKED_KEYS: Vec<String> = Vec::new();

fn main() {
    println!("Global Key Listener started. Press Ctrl+C to exit.");
    println!("Send a JSON array of keys to block via stdin, e.g.:");
    println!("Events will be output as JSON to stdout.");

    // Flush stdout to ensure the startup message is displayed
    io::stdout().flush().unwrap();

    // Spawn a thread to read blocked keys from stdin
    thread::spawn(|| {
        let stdin = io::stdin();
        for line in stdin.lock().lines() {
            if let Ok(line) = line {
                if let Ok(config) = serde_json::from_str::<BlockConfig>(&line) {
                    unsafe {
                        BLOCKED_KEYS = config.keys;
                        println!("Updated blocked keys: {:?}", BLOCKED_KEYS);
                    }
                }
            }
        }
    });

    // Start grabbing events
    if let Err(error) = grab(callback) {
        eprintln!("Error: {:?}", error);
    }
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
        "raw_code": key_to_code(key)
    });

    println!("{}", event_json);
    io::stdout().flush().unwrap();
}

fn key_to_code(key: &Key) -> Option<u32> {
    match key {
        Key::Alt => Some(18),
        Key::AltGr => Some(225),
        Key::Backspace => Some(8),
        Key::CapsLock => Some(20),
        Key::ControlLeft => Some(17),
        Key::ControlRight => Some(17),
        Key::Delete => Some(46),
        Key::DownArrow => Some(40),
        Key::End => Some(35),
        Key::Escape => Some(27),
        Key::F1 => Some(112),
        Key::F2 => Some(113),
        Key::F3 => Some(114),
        Key::F4 => Some(115),
        Key::F5 => Some(116),
        Key::F6 => Some(117),
        Key::F7 => Some(118),
        Key::F8 => Some(119),
        Key::F9 => Some(120),
        Key::F10 => Some(121),
        Key::F11 => Some(122),
        Key::F12 => Some(123),
        Key::Home => Some(36),
        Key::LeftArrow => Some(37),
        Key::MetaLeft => Some(91),
        Key::MetaRight => Some(92),
        Key::PageDown => Some(34),
        Key::PageUp => Some(33),
        Key::Return => Some(13),
        Key::RightArrow => Some(39),
        Key::ShiftLeft => Some(16),
        Key::ShiftRight => Some(16),
        Key::Space => Some(32),
        Key::Tab => Some(9),
        Key::UpArrow => Some(38),
        Key::PrintScreen => Some(44),
        Key::ScrollLock => Some(145),
        Key::Pause => Some(19),
        Key::NumLock => Some(144),
        Key::BackQuote => Some(192),
        Key::Num1 => Some(49),
        Key::Num2 => Some(50),
        Key::Num3 => Some(51),
        Key::Num4 => Some(52),
        Key::Num5 => Some(53),
        Key::Num6 => Some(54),
        Key::Num7 => Some(55),
        Key::Num8 => Some(56),
        Key::Num9 => Some(57),
        Key::Num0 => Some(48),
        Key::Minus => Some(189),
        Key::Equal => Some(187),
        Key::KeyQ => Some(81),
        Key::KeyW => Some(87),
        Key::KeyE => Some(69),
        Key::KeyR => Some(82),
        Key::KeyT => Some(84),
        Key::KeyY => Some(89),
        Key::KeyU => Some(85),
        Key::KeyI => Some(73),
        Key::KeyO => Some(79),
        Key::KeyP => Some(80),
        Key::LeftBracket => Some(219),
        Key::RightBracket => Some(221),
        Key::KeyA => Some(65),
        Key::KeyS => Some(83),
        Key::KeyD => Some(68),
        Key::KeyF => Some(70),
        Key::KeyG => Some(71),
        Key::KeyH => Some(72),
        Key::KeyJ => Some(74),
        Key::KeyK => Some(75),
        Key::KeyL => Some(76),
        Key::SemiColon => Some(186),
        Key::Quote => Some(222),
        Key::BackSlash => Some(220),
        Key::IntlBackslash => Some(226),
        Key::KeyZ => Some(90),
        Key::KeyX => Some(88),
        Key::KeyC => Some(67),
        Key::KeyV => Some(86),
        Key::KeyB => Some(66),
        Key::KeyN => Some(78),
        Key::KeyM => Some(77),
        Key::Comma => Some(188),
        Key::Dot => Some(190),
        Key::Slash => Some(191),
        _ => None, // For keys that don't have a standard code
    }
}

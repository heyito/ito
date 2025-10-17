use clap::Parser;
use std::process;
use std::thread;
use std::time::Duration;

#[cfg(target_os = "linux")]
use enigo::{Enigo, Key, Keyboard, Settings};

#[cfg(target_os = "macos")]
mod macos_writer;
#[cfg(target_os = "macos")]
use macos_writer::type_text_macos;

#[cfg(target_os = "windows")]
mod windows_writer;
#[cfg(target_os = "windows")]
use windows_writer::type_text_windows;

#[derive(Parser)]
#[command(name = "text-writer")]
#[command(about = "A cross-platform text typing utility")]
#[command(version = "0.1.0")]
struct Args {
    #[arg(help = "Text to type")]
    text: String,

    #[arg(
        short,
        long,
        default_value_t = 0,
        help = "Delay before typing (milliseconds)"
    )]
    delay: u64,

    #[arg(
        short,
        long,
        default_value_t = 0,
        help = "Delay between characters (milliseconds)"
    )]
    char_delay: u64,
}

fn main() {
    let args = Args::parse();

    if args.text.is_empty() {
        eprintln!("Error: Text cannot be empty");
        process::exit(1);
    }

    if args.delay > 0 {
        thread::sleep(Duration::from_millis(args.delay));
    }

    // Use platform-specific implementation
    #[cfg(target_os = "macos")]
    {
        if let Err(e) = type_text_macos(&args.text, args.char_delay) {
            eprintln!("Error typing text: {}", e);
            process::exit(1);
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Err(e) = type_text_windows(&args.text, args.char_delay) {
            eprintln!("Error typing text: {}", e);
            process::exit(1);
        }
    }

    #[cfg(target_os = "linux")]
    {
        let mut enigo = match Enigo::new(&Settings::default()) {
            Ok(enigo) => enigo,
            Err(e) => {
                eprintln!("Error initializing enigo: {}", e);
                process::exit(1);
            }
        };

        if args.char_delay > 0 {
            for ch in args.text.chars() {
                if let Err(e) = enigo.text(&ch.to_string()) {
                    eprintln!("Error typing character '{}': {}", ch, e);
                    process::exit(1);
                }
                thread::sleep(Duration::from_millis(args.char_delay));
            }
        } else {
            if let Err(e) = enigo.text(&args.text) {
                eprintln!("Error typing text: {}", e);
                process::exit(1);
            }
        }

        // Patch fix: Send 'A' key release to clean up any phantom stuck KeyA events
        // This addresses a bug where synthetic events from text typing can cause
        // the global key listener to receive keydown events without corresponding keyup
        // events
        if let Err(e) = enigo.key(Key::Unicode('a'), enigo::Direction::Release) {
            // Don't exit on this error since it's just a cleanup operation
            eprintln!("Warning: Failed to send cleanup 'a' key release: {}", e);
        }
    }
}

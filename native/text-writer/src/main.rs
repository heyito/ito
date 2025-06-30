use clap::Parser;
use enigo::{Enigo, Keyboard, Settings};
use std::process;
use std::thread;
use std::time::Duration;

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
}

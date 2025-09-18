use arboard::Clipboard;
use enigo::{Enigo, Key, Direction, Settings, Keyboard};
use std::thread;
use std::time::Duration;

fn main() {
    println!("Testing Windows copy functionality in isolation...");

    let mut clipboard = Clipboard::new().expect("Failed to create clipboard");

    // Store original clipboard
    let original = clipboard.get_text().unwrap_or_default();
    println!("Original clipboard: '{}'", original);

    // Clear clipboard
    clipboard.clear().expect("Failed to clear clipboard");
    println!("Clipboard cleared");

    // Wait a moment for user to select some text
    println!("Please select some text in any application and press Enter...");
    let mut input = String::new();
    std::io::stdin().read_line(&mut input).unwrap();

    // Try to copy selected text
    println!("Attempting to copy selected text with Ctrl+C...");

    let settings = Settings::default();
    let mut enigo = Enigo::new(&settings).expect("Failed to create enigo");

    // Send Ctrl+C
    enigo.key(Key::Control, Direction::Press).expect("Failed to press Ctrl");
    thread::sleep(Duration::from_millis(10));
    enigo.key(Key::Unicode('c'), Direction::Click).expect("Failed to click C");
    thread::sleep(Duration::from_millis(10));
    enigo.key(Key::Control, Direction::Release).expect("Failed to release Ctrl");

    // Wait for clipboard to update
    thread::sleep(Duration::from_millis(100));

    // Check what we got
    match clipboard.get_text() {
        Ok(text) => {
            println!("Success! Copied text: '{}'", text);
            println!("Length: {} characters", text.len());
        }
        Err(e) => {
            println!("Failed to get clipboard text: {:?}", e);
        }
    }

    // Restore original clipboard
    let _ = clipboard.set_text(original);
    println!("Clipboard restored");
}
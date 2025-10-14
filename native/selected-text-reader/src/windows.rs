use arboard::Clipboard;
use std::thread;
use std::time::Duration;
use selection::get_text;

// Count characters as the editor sees them (CRLF = 1 cursor position on Windows)
pub fn count_editor_chars(text: &str) -> usize {
    // On Windows, editors treat CRLF as a single cursor position when navigating with arrow keys
    text.replace("\r\n", "\n").chars().count()
}

pub fn get_selected_text() -> Result<String, Box<dyn std::error::Error>> {
    let selected_text = get_text();
    Ok(selected_text)
}


pub fn copy_selected_text() -> Result<(), Box<dyn std::error::Error>> {
    use enigo::{Enigo, Key, Keyboard, Settings, Direction};

    let mut enigo = Enigo::new(&Settings::default())?;
    enigo.key(Key::Control, Direction::Press)?;
    enigo.key(Key::Unicode('c'), Direction::Click)?;
    enigo.key(Key::Control, Direction::Release)?;

    Ok(())
}

fn cut_selected_text() -> Result<(), Box<dyn std::error::Error>> {
    use enigo::{Enigo, Key, Keyboard, Settings, Direction};

    let mut enigo = Enigo::new(&Settings::default())?;
    enigo.key(Key::Control, Direction::Press)?;
    enigo.key(Key::Unicode('x'), Direction::Click)?;
    enigo.key(Key::Control, Direction::Release)?;

    Ok(())
}


// Simple function to select previous N characters and copy them
pub fn select_previous_chars_and_copy(
    char_count: usize,
    clipboard: &mut Clipboard,
) -> Result<String, Box<dyn std::error::Error>> {
    // Send Shift+Left N times to select precursor text
    for _ in 0..char_count {
        #[cfg(target_os = "windows")]
        {
            use enigo::{Enigo, Key, Keyboard, Settings, Direction};
            let mut enigo = Enigo::new(&Settings::default())?;
            enigo.key(Key::Shift, Direction::Press)?;
            enigo.key(Key::LeftArrow, Direction::Click)?;
            enigo.key(Key::Shift, Direction::Release)?;
        }

        // Brief pause between selections
        thread::sleep(Duration::from_millis(1));
    }

    // Allow selection to complete
    thread::sleep(Duration::from_millis(10));

    copy_selected_text()?;

    // Adaptively wait for and get text from clipboard
    let mut context_text = String::new();
    let max_retries = 20; // Poll for a maximum of 20 * 10ms = 200ms
    for _ in 0..max_retries {
        // Give a tiny bit of time for the clipboard to update
        thread::sleep(Duration::from_millis(10));

        if let Ok(text) = clipboard.get_text() {
            if !text.is_empty() {
                context_text = text;
                break; // Success! We got the text.
            }
        }
    }

    Ok(context_text)
}

// Shift cursor right while deselecting text
pub fn shift_cursor_right_with_deselect(
    char_count: usize,
) -> Result<(), Box<dyn std::error::Error>> {
    if char_count == 0 {
        return Ok(());
    }

    for _ in 0..char_count {
        {
            use enigo::{Enigo, Key, Keyboard, Settings, Direction};
            let mut enigo = Enigo::new(&Settings::default())?;
            enigo.key(Key::Shift, Direction::Press)?;
            enigo.key(Key::RightArrow, Direction::Click)?;
            enigo.key(Key::Shift, Direction::Release)?;
        }
        // Brief pause between movements
        if char_count > 1 {
            thread::sleep(Duration::from_millis(1));
        }
    }

    Ok(())
}

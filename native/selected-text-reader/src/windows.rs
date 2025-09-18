use arboard::Clipboard;
use enigo::{Enigo, Key, Direction, Settings, Keyboard};
use std::thread;
use std::time::Duration;

pub fn get_selected_text() -> Result<String, Box<dyn std::error::Error>> {
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard init failed: {}", e))?;

    // Store original clipboard contents
    let original_clipboard = clipboard.get_text().unwrap_or_default();

    // Clear clipboard to detect if copy worked
    clipboard.clear().map_err(|e| format!("Clipboard clear failed: {}", e))?;

    // Use Ctrl+C directly - this works with existing guard rails in global-key-listener
    copy_selected_text_enigo()?;

    // Small delay for copy operation (reduced for better responsiveness)
    thread::sleep(Duration::from_millis(50));

    // Get the copied text from clipboard
    let selected_text = clipboard.get_text().unwrap_or_default();

    // Always restore original clipboard
    let _ = clipboard.set_text(original_clipboard);

    Ok(selected_text)
}

// Use enigo for native keyboard input (Ctrl+C)
fn copy_selected_text_enigo() -> Result<(), Box<dyn std::error::Error>> {
    let settings = Settings::default();
    let mut enigo = Enigo::new(&settings).map_err(|e| format!("Failed to create Enigo: {:?}", e))?;

    // Use standard Ctrl+C (enigo 0.3.0 uses Key::Control)
    enigo.key(Key::Control, Direction::Press).map_err(|e| format!("Failed to press Ctrl: {:?}", e))?;
    thread::sleep(Duration::from_millis(10));
    enigo.key(Key::Unicode('c'), Direction::Click).map_err(|e| format!("Failed to click C: {:?}", e))?;
    thread::sleep(Duration::from_millis(10));
    enigo.key(Key::Control, Direction::Release).map_err(|e| format!("Failed to release Ctrl: {:?}", e))?;

    Ok(())
}

// Last resort: PowerShell
fn copy_selected_text_powershell() -> Result<(), Box<dyn std::error::Error>> {
    use std::process::Command;

    Command::new("powershell")
        .args(&["-Command", "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c')"])
        .output()?;

    Ok(())
}

pub fn get_cursor_context(context_length: usize) -> Result<String, Box<dyn std::error::Error>> {
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard init failed: {}", e))?;

    // Store original clipboard contents
    let original_clipboard = clipboard.get_text().unwrap_or_default();

    // Clear clipboard
    clipboard.clear().map_err(|e| format!("Clipboard clear failed: {}", e))?;

    // Select previous context_length characters using enigo
    let settings = Settings::default();
    let mut enigo = Enigo::new(&settings).map_err(|e| format!("Failed to create Enigo: {:?}", e))?;

    // Hold shift and press left arrow context_length times
    enigo.key(Key::Shift, Direction::Press).map_err(|e| format!("Failed to press Shift: {:?}", e))?;
    for _ in 0..context_length {
        enigo.key(Key::LeftArrow, Direction::Click).map_err(|e| format!("Failed to click Left Arrow: {:?}", e))?;
        thread::sleep(Duration::from_millis(1));
    }
    enigo.key(Key::Shift, Direction::Release).map_err(|e| format!("Failed to release Shift: {:?}", e))?;

    // Small delay to ensure selection is complete
    thread::sleep(Duration::from_millis(10));

    // Copy the selection using Ctrl+C only
    copy_selected_text_enigo()?;

    // Wait for clipboard to update
    thread::sleep(Duration::from_millis(25));

    // Get the copied text
    let context_text = clipboard.get_text().unwrap_or_default();

    // Restore cursor position by moving right
    let chars_to_restore = std::cmp::min(context_text.chars().count(), context_length);
    if chars_to_restore > 0 {
        enigo.key(Key::Shift, Direction::Press).map_err(|e| format!("Failed to press Shift for restore: {:?}", e))?;
        for _ in 0..chars_to_restore {
            enigo.key(Key::RightArrow, Direction::Click).map_err(|e| format!("Failed to click Right Arrow: {:?}", e))?;
            thread::sleep(Duration::from_millis(1));
        }
        enigo.key(Key::Shift, Direction::Release).map_err(|e| format!("Failed to release Shift for restore: {:?}", e))?;
    }

    // Always restore original clipboard
    let _ = clipboard.set_text(original_clipboard);

    // Take only the last context_length characters if we got more
    let final_context = if context_text.len() <= context_length {
        context_text
    } else {
        context_text
            .chars()
            .rev()
            .take(context_length)
            .collect::<String>()
            .chars()
            .rev()
            .collect()
    };

    Ok(final_context)
}
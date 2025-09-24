use arboard::Clipboard;
use std::thread;
use std::time::Duration;

pub fn get_selected_text() -> Result<String, Box<dyn std::error::Error>> {
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard init failed: {}", e))?;

    // Store original clipboard contents
    let original_clipboard = clipboard.get_text().unwrap_or_default();

    clipboard
        .clear()
        .map_err(|e| format!("Clipboard clear failed: {}", e))?;

    copy_selected_text()?;

    // Small delay for copy operation to complete
    thread::sleep(Duration::from_millis(25));

    // Get the copy text from clipboard (this is what was selected)
    let selected_text = clipboard.get_text().unwrap_or_default();

    // Always restore original clipboard contents - ITO is copying on behalf of user for context
    let _ = clipboard.set_text(original_clipboard);

    Ok(selected_text)
}

#[cfg(target_os = "windows")]
pub fn copy_selected_text() -> Result<(), Box<dyn std::error::Error>> {
    use std::process::Command;

    // Use PowerShell to send Ctrl+C on Windows
    Command::new("powershell")
        .args(&["-Command", "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c')"])
        .output()?;

    Ok(())
}

#[cfg(target_os = "linux")]
pub fn copy_selected_text() -> Result<(), Box<dyn std::error::Error>> {
    use std::process::Command;

    // Use xdotool to send Ctrl+C on Linux
    Command::new("xdotool").args(&["key", "ctrl+c"]).output()?;

    Ok(())
}

#[cfg(target_os = "windows")]
fn cut_selected_text() -> Result<(), Box<dyn std::error::Error>> {
    use std::process::Command;

    // Use PowerShell to send Ctrl+X on Windows
    Command::new("powershell")
        .args(&["-Command", "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^x')"])
        .output()?;

    Ok(())
}

#[cfg(target_os = "linux")]
fn cut_selected_text() -> Result<(), Box<dyn std::error::Error>> {
    use std::process::Command;

    // Use xdotool to send Ctrl+X on Linux
    Command::new("xdotool").args(&["key", "ctrl+x"]).output()?;

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
            use std::process::Command;
            let _output = Command::new("powershell")
                .args(&["-Command", "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('+{LEFT}')"])
                .output()?;
        }

        #[cfg(target_os = "linux")]
        {
            use std::process::Command;
            let _ = Command::new("xdotool")
                .args(&["key", "shift+Left"])
                .output();
        }

        // Brief pause between selections
        thread::sleep(Duration::from_millis(1));
    }

    // Allow selection to complete
    thread::sleep(Duration::from_millis(10));

    copy_selected_text()?;
    thread::sleep(Duration::from_millis(25)); // Wait for copy to complete

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
pub fn shift_cursor_right_with_deselect(char_count: usize) -> Result<(), Box<dyn std::error::Error>> {
    if char_count == 0 {
        return Ok(());
    }

    for _ in 0..char_count {
        #[cfg(target_os = "windows")]
        {
            use std::process::Command;
            let _output = Command::new("powershell")
                .args(&["-Command", "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('+{RIGHT}')"])
                .output()?;
        }

        #[cfg(target_os = "linux")]
        {
            use std::process::Command;
            let _ = Command::new("xdotool")
                .args(&["key", "shift+Right"])
                .output();
        }

        // Brief pause between movements
        if char_count > 1 {
            thread::sleep(Duration::from_millis(1));
        }
    }

    Ok(())
}

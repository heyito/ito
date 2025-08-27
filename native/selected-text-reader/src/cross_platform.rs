use arboard::Clipboard;
use std::time::Duration;
use std::thread;

pub fn get_selected_text() -> Result<String, Box<dyn std::error::Error>> {
    get_selected_text_by_clipboard_cross_platform()
}

// Windows/Linux implementation using clipboard method
fn get_selected_text_by_clipboard_cross_platform() -> Result<String, Box<dyn std::error::Error>> {
    let mut clipboard = Clipboard::new()?;
    
    // Store original clipboard contents
    let original_clipboard = clipboard.get_text().unwrap_or_default();
    
    // Clear clipboard to detect if copy worked
    clipboard.clear()?;
    
    // Copy selected text using Ctrl+C
    copy_selected_text()?;
    
    // Small delay for copy operation
    thread::sleep(Duration::from_millis(100));
    
    // Get copied text
    let result = match clipboard.get_text() {
        Ok(text) => {
            if text.is_empty() {
                Ok(String::new())
            } else {
                Ok(text)
            }
        }
        Err(_) => Ok(String::new()),
    };
    
    // Restore original clipboard
    let _ = clipboard.set_text(original_clipboard);
    
    result
}

#[cfg(target_os = "windows")]
fn copy_selected_text() -> Result<(), Box<dyn std::error::Error>> {
    use std::process::Command;
    
    // Use PowerShell to send Ctrl+C on Windows
    Command::new("powershell")
        .args(&["-Command", "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c')"])
        .output()?;
    
    Ok(())
}

#[cfg(target_os = "linux")]
fn copy_selected_text() -> Result<(), Box<dyn std::error::Error>> {
    use std::process::Command;
    
    // Use xdotool to send Ctrl+C on Linux
    Command::new("xdotool")
        .args(&["key", "ctrl+c"])
        .output()?;
    
    Ok(())
}
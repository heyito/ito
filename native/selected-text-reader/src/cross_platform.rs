use arboard::Clipboard;
use std::thread;
use std::time::Duration;

pub fn get_selected_text() -> Result<String, Box<dyn std::error::Error>> {
    use std::time::Instant;
    
    let start_time = Instant::now();
    
    // Simple approach: use Ctrl+X (cut) to get any selected text
    // This is much faster and more reliable than copy-based methods
    
    let clipboard_init_start = Instant::now();
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard init failed: {}", e))?;
    
    // Store original clipboard contents
    let get_clipboard_start = Instant::now();
    let original_clipboard = clipboard.get_text().unwrap_or_default();
    
    // Clear clipboard to detect if cut worked
    let clear_start = Instant::now();
    clipboard.clear().map_err(|e| format!("Clipboard clear failed: {}", e))?;
    
    // Use Ctrl+X to cut any selected text
    let cut_start = Instant::now();
    cut_selected_text()?;
    
    // Small delay for cut operation to complete
    thread::sleep(Duration::from_millis(25));
    
    // Get the cut text from clipboard (this is what was selected)
    let get_cut_text_start = Instant::now();
    let selected_text = clipboard.get_text().unwrap_or_default();
    
    // Always restore original clipboard contents - ITO is cutting on behalf of user for context
    let restore_start = Instant::now();
    let _ = clipboard.set_text(original_clipboard);
    
    let total_time = start_time.elapsed();
    
    Ok(selected_text)
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

pub fn get_cursor_context(context_length: usize) -> Result<String, Box<dyn std::error::Error>> {
    use std::time::Instant;
    
    let start_time = Instant::now();
    
    // Use keyboard commands to get cursor context
    // This is more reliable across different applications than Accessibility API
    
    let clipboard_init_start = Instant::now();
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard init failed: {}", e))?;
    
    // Store original clipboard contents
    let get_clipboard_start = Instant::now();
    let original_clipboard = clipboard.get_text().unwrap_or_default();
    
    
    // Strategy: Use Ctrl+Shift+Left to select context, then copy WITHOUT restoring cursor position
    let select_context_start = Instant::now();
    let result = get_context_with_keyboard_selection(context_length, &mut clipboard);
    
    // Always restore original clipboard
    let restore_clipboard_start = Instant::now();
    let _ = clipboard.set_text(original_clipboard);
    
    let total_time = start_time.elapsed();
    
    // Return debug info if we got nothing
    match result {
        Ok(ref text) if text.is_empty() => {
            Ok(format!("[DEBUG] Empty result - check console for details"))
        }
        Ok(text) => Ok(text),
        Err(e) => Ok(format!("[ERROR] {}", e)),
    }
}

#[cfg(target_os = "windows")]
fn get_cursor_context_windows(context_length: usize) -> Result<String, Box<dyn std::error::Error>> {
    // Use keyboard-based approach for Windows
    // This is more reliable and works across different applications
    
    
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard init failed: {}", e))?;
    
    // Store original clipboard contents
    let original_clipboard = clipboard.get_text().unwrap_or_default();
    
    // Check if there's already text selected
    let existing_selection = match get_selected_text() {
        Ok(text) if !text.is_empty() => Some(text),
        _ => None,
    };
    
    
    // Clear clipboard to detect if our operation worked
    clipboard.clear().map_err(|e| format!("Clipboard clear failed: {}", e))?;
    
    // Strategy: Use Ctrl+Shift+Home to select from cursor to beginning of line
    let result = select_line_and_get_context_windows(context_length, &mut clipboard, existing_selection);
    
    // Always restore original clipboard
    let _ = clipboard.set_text(original_clipboard);
    
    // Return debug info if we got nothing
    match result {
        Ok(ref text) if text.is_empty() => {
            Ok(format!("[DEBUG Windows] Empty result - check console for details"))
        }
        Ok(text) => Ok(text),
        Err(e) => Ok(format!("[ERROR Windows] {}", e)),
    }
}

fn get_context_with_keyboard_selection(
    context_length: usize,
    clipboard: &mut Clipboard,
) -> Result<String, Box<dyn std::error::Error>> {
    use std::time::Instant;
    
    let start_time = Instant::now();
    
    // Use Ctrl+Shift+Left to select text backwards from cursor
    
    #[cfg(target_os = "windows")]
    {
        // Use PowerShell to send Ctrl+Shift+Left repeatedly to select context
        use std::process::Command;
        let selection_script = format!(
            r#"
            Add-Type -AssemblyName System.Windows.Forms
            for ($i = 0; $i -lt {}; $i++) {{
                [System.Windows.Forms.SendKeys]::SendWait("^+{{LEFT}}")
                Start-Sleep -Milliseconds 1
            }}
            "#,
            std::cmp::min(context_length / 5 + 1, 10) // Estimate words to select
        );
        
        let _output = Command::new("powershell")
            .args(&["-Command", &selection_script])
            .output()?;
    }
    
    #[cfg(target_os = "linux")]
    {
        // Use xdotool to send Ctrl+Shift+Left repeatedly
        use std::process::Command;
        let words_to_select = std::cmp::min(context_length / 5 + 1, 10);
        
        for _ in 0..words_to_select {
            let _ = Command::new("xdotool")
                .args(&["key", "ctrl+shift+Left"])
                .output();
            thread::sleep(Duration::from_millis(2));
        }
    }
    
    let keyboard_time = start_time.elapsed();
    
    // Copy the selection
    copy_selected_text()?;
    
    thread::sleep(Duration::from_millis(25));
    
    // Get the copied text
    let context_text = clipboard.get_text().unwrap_or_default();
    
    // Restore cursor position by pressing Right Arrow once
    
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let restore_script = r#"
            Add-Type -AssemblyName System.Windows.Forms
            [System.Windows.Forms.SendKeys]::SendWait("{RIGHT}")
        "#;
        
        let _output = Command::new("powershell")
            .args(&["-Command", restore_script])
            .output()?;
    }
    
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let _ = Command::new("xdotool")
            .args(&["key", "Right"])
            .output();
    }
    
    let restore_time = start_time.elapsed();
    
    // Take only the last context_length characters
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
    
    let total_time = start_time.elapsed();
    
    Ok(final_context)
}

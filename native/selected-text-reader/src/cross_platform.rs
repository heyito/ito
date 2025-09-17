use arboard::Clipboard;
use std::thread;
use std::time::Duration;

pub fn get_selected_text() -> Result<String, Box<dyn std::error::Error>> {
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard init failed: {}", e))?;
    
    // Store original clipboard contents
    let original_clipboard = clipboard.get_text().unwrap_or_default();
    
    clipboard.clear().map_err(|e| format!("Clipboard clear failed: {}", e))?;
    
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
    // Use keyboard commands to get cursor context
    // This is more reliable across different applications than Accessibility API
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard init failed: {}", e))?;
    
    // Store original clipboard contents
    let original_clipboard = clipboard.get_text().unwrap_or_default();
    
    let result = get_context_with_keyboard_selection(context_length, &mut clipboard);
    
    // Always restore original clipboard
    let _ = clipboard.set_text(original_clipboard);
    
    // Return debug info if we got nothing
    match result {
        Ok(ref text) if text.is_empty() => {
            Ok(format!("[DEBUG] Empty result - check console for details"))
        }
        Ok(text) => Ok(text),
        Err(e) => Ok(format!("[ERROR] {}", e)),
    }
}

fn get_context_with_keyboard_selection(
    context_length: usize,
    clipboard: &mut Clipboard,
) -> Result<String, Box<dyn std::error::Error>> {
    #[cfg(target_os = "windows")]
    {
        // Use PowerShell to send Shift+Left repeatedly to select context
        use std::process::Command;
        let selection_script = format!(
            r#"
            Add-Type -AssemblyName System.Windows.Forms
            for ($i = 0; $i -lt {}; $i++) {{
                [System.Windows.Forms.SendKeys]::SendWait("+{{LEFT}}")
                Start-Sleep -Milliseconds 1
            }}
            "#,
            context_length
        );
        
        let _output = Command::new("powershell")
            .args(&["-Command", &selection_script])
            .output()?;
    }
    
    #[cfg(target_os = "linux")]
    {
        // Use xdotool to send Shift+Left repeatedly
        use std::process::Command;
        
        for _ in 0..context_length {
            let _ = Command::new("xdotool")
                .args(&["key", "shift+Left"])
                .output();
            thread::sleep(Duration::from_millis(2));
        }
    }
    
    // Copy the selection
    copy_selected_text()?;
    
    thread::sleep(Duration::from_millis(25));
    
    // Get the copied text
    let context_text = clipboard.get_text().unwrap_or_default();
    
    // Restore cursor position by pressing shift + Right Arrow character times
    
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let restore_script = format!(
            r#"
            Add-Type -AssemblyName System.Windows.Forms
            for ($i = 0; $i -lt {}; $i++) {{
                [System.Windows.Forms.SendKeys]::SendWait("+{{RIGHT}}")
                Start-Sleep -Milliseconds 1
            }}
            "#,
            context_length
        );
        
        let _output = Command::new("powershell")
            .args(&["-Command", &restore_script])
            .output()?;
    }
    
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        for _ in 0..context_length {
            let _ = Command::new("xdotool")
                .args(&["key", "shift+Right"])
                .output();
            thread::sleep(Duration::from_millis(2));
        }
    }

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

    Ok(final_context)
}

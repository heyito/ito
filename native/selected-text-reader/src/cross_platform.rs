use arboard::Clipboard;
use std::thread;
use std::time::Duration;

pub fn get_selected_text() -> Result<String, Box<dyn std::error::Error>> {
    use std::time::Instant;
    
    let start_time = Instant::now();
    eprintln!("[DEBUG TIMING] get_selected_text started");
    
    // Simple approach: use Ctrl+X (cut) to get any selected text
    // This is much faster and more reliable than copy-based methods
    
    let clipboard_init_start = Instant::now();
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard init failed: {}", e))?;
    eprintln!("[DEBUG TIMING] Clipboard::new() took: {:?}", clipboard_init_start.elapsed());
    
    // Store original clipboard contents
    let get_clipboard_start = Instant::now();
    let original_clipboard = clipboard.get_text().unwrap_or_default();
    eprintln!("[DEBUG TIMING] clipboard.get_text() took: {:?}", get_clipboard_start.elapsed());
    
    // Clear clipboard to detect if cut worked
    let clear_start = Instant::now();
    clipboard.clear().map_err(|e| format!("Clipboard clear failed: {}", e))?;
    eprintln!("[DEBUG TIMING] clipboard.clear() took: {:?}", clear_start.elapsed());
    
    // Use Ctrl+X to cut any selected text
    let cut_start = Instant::now();
    cut_selected_text()?;
    eprintln!("[DEBUG TIMING] Ctrl+X (cut) took: {:?}", cut_start.elapsed());
    
    // Small delay for cut operation to complete
    thread::sleep(Duration::from_millis(25));
    
    // Get the cut text from clipboard (this is what was selected)
    let get_cut_text_start = Instant::now();
    let selected_text = clipboard.get_text().unwrap_or_default();
    eprintln!("[DEBUG TIMING] Getting cut text took: {:?}", get_cut_text_start.elapsed());
    
    // Always restore original clipboard contents - ITO is cutting on behalf of user for context
    let restore_start = Instant::now();
    let _ = clipboard.set_text(original_clipboard);
    eprintln!("[DEBUG TIMING] Restoring clipboard took: {:?}", restore_start.elapsed());
    
    let total_time = start_time.elapsed();
    eprintln!("[DEBUG TIMING] get_selected_text TOTAL took: {:?}", total_time);
    
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

pub fn get_cursor_context(context_length: usize, cut_current_selection: bool) -> Result<String, Box<dyn std::error::Error>> {
    use std::time::Instant;
    
    let start_time = Instant::now();
    eprintln!("[DEBUG TIMING] get_cursor_context started");
    
    // Use keyboard commands to get cursor context
    // This is more reliable across different applications than Accessibility API
    
    let clipboard_init_start = Instant::now();
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard init failed: {}", e))?;
    eprintln!("[DEBUG TIMING] Clipboard::new() took: {:?}", clipboard_init_start.elapsed());
    
    // Store original clipboard contents
    let get_clipboard_start = Instant::now();
    let original_clipboard = clipboard.get_text().unwrap_or_default();
    eprintln!("[DEBUG TIMING] clipboard.get_text() took: {:?}", get_clipboard_start.elapsed());
    
    // Conditionally cut selected text based on parameter
    if cut_current_selection {
        eprintln!("[DEBUG] Cutting any selected text with Ctrl+X to position cursor correctly");
        let cut_start = Instant::now();
        native_ctrl_x()?;
        thread::sleep(Duration::from_millis(25)); // Wait for cut to complete
        eprintln!("[DEBUG TIMING] Ctrl+X cut operation took: {:?}", cut_start.elapsed());
    } else {
        eprintln!("[DEBUG] Skipping cut operation - assumes no selected text or get_selected_text called first");
    }
    
    // Strategy: Use Ctrl+Shift+Left to select context, then copy WITHOUT restoring cursor position
    let select_context_start = Instant::now();
    let result = get_context_with_keyboard_selection(context_length, &mut clipboard);
    eprintln!("[DEBUG TIMING] get_context_with_keyboard_selection() took: {:?}", select_context_start.elapsed());
    
    // Always restore original clipboard
    let restore_clipboard_start = Instant::now();
    let _ = clipboard.set_text(original_clipboard);
    eprintln!("[DEBUG TIMING] clipboard.set_text() took: {:?}", restore_clipboard_start.elapsed());
    
    let total_time = start_time.elapsed();
    eprintln!("[DEBUG TIMING] get_cursor_context TOTAL took: {:?}", total_time);
    
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
    
    eprintln!("[DEBUG Windows] Starting cursor context detection, context_length: {}", context_length);
    
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard init failed: {}", e))?;
    
    // Store original clipboard contents
    let original_clipboard = clipboard.get_text().unwrap_or_default();
    
    // Check if there's already text selected
    let existing_selection = match get_selected_text() {
        Ok(text) if !text.is_empty() => Some(text),
        _ => None,
    };
    
    eprintln!("[DEBUG Windows] Existing selection: {:?}", existing_selection);
    
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
    eprintln!("[DEBUG] Starting cursor context detection, context_length: {}", context_length);
    
    // Use Ctrl+Shift+Left to select text backwards from cursor
    eprintln!("[DEBUG] Sending keyboard selection");
    
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
    eprintln!("[DEBUG] Keyboard selection took: {:?}", keyboard_time);
    
    // Copy the selection
    eprintln!("[DEBUG] Copying selection with Ctrl+C");
    copy_selected_text()?;
    
    thread::sleep(Duration::from_millis(25));
    
    // Get the copied text
    let context_text = clipboard.get_text().unwrap_or_default();
    eprintln!("[DEBUG] Copied text: {:?} (length: {})", context_text, context_text.len());
    
    // Restore cursor position by pressing Right Arrow once
    eprintln!("[DEBUG] Restoring cursor position");
    
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
    eprintln!("[DEBUG] Cursor restoration took: {:?}", restore_time);
    
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
    eprintln!("[DEBUG] Total cursor context took: {:?}", total_time);
    eprintln!("[DEBUG] Final context text: {:?}", final_context);
    
    Ok(final_context)
}

pub fn select_backwards(word_count: usize, char_count: usize) -> Result<(), Box<dyn std::error::Error>> {
    use std::time::Instant;
    
    let start_time = Instant::now();
    eprintln!("[DEBUG] Starting select_backwards: {} words, {} chars", word_count, char_count);
    
    // First, send Ctrl+Shift+Left for word selection (word_count times)
    if word_count > 0 {
        let word_start = Instant::now();
        
        #[cfg(target_os = "windows")]
        {
            use std::process::Command;
            
            for i in 0..word_count {
                eprintln!("[DEBUG] Sending Ctrl+Shift+Left #{}", i + 1);
                
                let word_select_script = r#"
                    Add-Type -AssemblyName System.Windows.Forms
                    [System.Windows.Forms.SendKeys]::SendWait("^+{LEFT}")
                "#;
                
                let _output = Command::new("powershell")
                    .args(&["-Command", word_select_script])
                    .output()?;
                
                thread::sleep(Duration::from_millis(2));
            }
        }
        
        #[cfg(target_os = "linux")]
        {
            use std::process::Command;
            
            for i in 0..word_count {
                eprintln!("[DEBUG] Sending Ctrl+Shift+Left #{}", i + 1);
                
                let _ = Command::new("xdotool")
                    .args(&["key", "ctrl+shift+Left"])
                    .output();
                    
                thread::sleep(Duration::from_millis(2));
            }
        }
        
        eprintln!("[DEBUG] Word selection took: {:?}", word_start.elapsed());
    }
    
    // Then, send Shift+Left for character selection (char_count times)
    if char_count > 0 {
        let char_start = Instant::now();
        
        #[cfg(target_os = "windows")]
        {
            use std::process::Command;
            
            for i in 0..char_count {
                eprintln!("[DEBUG] Sending Shift+Left #{}", i + 1);
                
                let char_select_script = r#"
                    Add-Type -AssemblyName System.Windows.Forms
                    [System.Windows.Forms.SendKeys]::SendWait("+{LEFT}")
                "#;
                
                let _output = Command::new("powershell")
                    .args(&["-Command", char_select_script])
                    .output()?;
                
                thread::sleep(Duration::from_millis(1));
            }
        }
        
        #[cfg(target_os = "linux")]
        {
            use std::process::Command;
            
            for i in 0..char_count {
                eprintln!("[DEBUG] Sending Shift+Left #{}", i + 1);
                
                let _ = Command::new("xdotool")
                    .args(&["key", "shift+Left"])
                    .output();
                    
                thread::sleep(Duration::from_millis(1));
            }
        }
        
        eprintln!("[DEBUG] Character selection took: {:?}", char_start.elapsed());
    }
    
    let total_time = start_time.elapsed();
    eprintln!("[DEBUG] select_backwards TOTAL took: {:?}", total_time);
    
    Ok(())
}


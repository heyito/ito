use arboard::Clipboard;
use libc::c_void;
use lru::LruCache;
use parking_lot::Mutex;
use std::num::NonZeroUsize;
use std::ptr;
use std::thread;
use std::time::Duration;

use accessibility_ng::{AXAttribute, AXUIElement};
use accessibility_sys_ng::{kAXFocusedUIElementAttribute, kAXSelectedTextAttribute};
use active_win_pos_rs::get_active_window;
use core_foundation::string::CFString;

static GET_SELECTED_TEXT_METHOD: Mutex<Option<LruCache<String, u8>>> = Mutex::new(None);

// Raw Quartz C API bindings for CGEventCreateKeyboardEvent
#[repr(C)]
struct __CGEvent(c_void);
type CGEventRef = *mut __CGEvent;

type CGKeyCode = u16;
type CGEventFlags = u64;
const CG_EVENT_FLAG_MASK_COMMAND: CGEventFlags = 0x100000;
const CG_EVENT_FLAG_MASK_SHIFT: CGEventFlags = 0x020000;
const CG_EVENT_FLAG_MASK_CONTROL: CGEventFlags = 0x040000;

type CGEventTapLocation = u32;
const CG_HID_EVENT_TAP: CGEventTapLocation = 0;
const CG_SESSION_EVENT_TAP: CGEventTapLocation = 1;

extern "C" {
    fn CGEventCreateKeyboardEvent(
        source: *mut c_void,
        virtualKey: CGKeyCode,
        keyDown: bool,
    ) -> CGEventRef;
    fn CGEventSetFlags(event: CGEventRef, flags: CGEventFlags);
    fn CGEventPost(tap: CGEventTapLocation, event: CGEventRef);
    fn CGEventSetIntegerValueField(event: CGEventRef, field: u32, value: i64);
    fn CFRelease(cf: *const c_void);
}

pub fn get_selected_text() -> Result<String, Box<dyn std::error::Error>> {
    use std::time::Instant;

    let start_time = Instant::now();

    // Simple approach: use Cmd+X (cut) to get any selected text
    // This is much faster and more reliable than complex fallback methods

    let clipboard_init_start = Instant::now();
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard init failed: {}", e))?;

    // Store original clipboard contents
    let get_clipboard_start = Instant::now();
    let original_clipboard = clipboard.get_text().unwrap_or_default();

    // Clear clipboard to detect if cut worked
    let clear_start = Instant::now();
    clipboard
        .clear()
        .map_err(|e| format!("Clipboard clear failed: {}", e))?;

    // Use Cmd+C to cut any selected text
    let copy_start = Instant::now();
    native_cmd_c()?;

    // Small delay for copy operation to complete
    thread::sleep(Duration::from_millis(25));

    // Get the copied text from clipboard (this is what was selected)
    let get_copy_text_start = Instant::now();
    let selected_text = clipboard.get_text().unwrap_or_default();

    // Always restore original clipboard contents - ITO is cutting on behalf of user for context
    let restore_start = Instant::now();
    let _ = clipboard.set_text(original_clipboard);

    let total_time = start_time.elapsed();

    Ok(selected_text)
}

// Fallback clipboard method for macOS with multiple copy strategies
fn get_selected_text_by_clipboard_macos() -> Result<String, Box<dyn std::error::Error>> {
    let mut clipboard = Clipboard::new()?;

    // Store original clipboard contents
    let original_clipboard = clipboard.get_text().unwrap_or_default();

    // Try different copy methods
    let copy_methods: Vec<fn(&mut Clipboard) -> Result<String, Box<dyn std::error::Error>>> =
        vec![single_copy_method, double_copy_method];

    for copy_method in copy_methods {
        match copy_method(&mut clipboard) {
            Ok(text) if !text.is_empty() => {
                // Restore original clipboard contents
                let _ = clipboard.set_text(original_clipboard);
                return Ok(text);
            }
            Ok(_) => continue,  // Empty text, try next method
            Err(_) => continue, // Method failed, try next
        }
    }

    // All methods failed, restore clipboard and return empty
    let _ = clipboard.set_text(original_clipboard);
    Ok(String::new())
}

// Standard single Cmd+C copy using native macOS events
fn single_copy_method(clipboard: &mut Clipboard) -> Result<String, Box<dyn std::error::Error>> {
    // Clear clipboard to detect if copy operation worked
    clipboard.clear()?;

    // Use native macOS keyboard events for better compatibility
    native_cmd_c()?;

    // Small delay to ensure copy operation completes
    thread::sleep(Duration::from_millis(25));

    // Try to get the copied text
    match clipboard.get_text() {
        Ok(text) => Ok(text),
        Err(_) => Ok(String::new()),
    }
}

// Native macOS Cmd+C implementation using raw Quartz C API - matching Python exactly
fn native_cmd_c() -> Result<(), Box<dyn std::error::Error>> {
    unsafe {
        // Key code for 'C' is 8 on macOS
        let c_key_code: CGKeyCode = 8;

        // Create key down event for Cmd+C - using None as source like Python
        let key_down_event = CGEventCreateKeyboardEvent(ptr::null_mut(), c_key_code, true);
        if key_down_event.is_null() {
            return Err("Failed to create key down event".into());
        }

        // Set Command flag
        CGEventSetFlags(key_down_event, CG_EVENT_FLAG_MASK_COMMAND);

        // Create key up event for Cmd+C - using None as source like Python
        let key_up_event = CGEventCreateKeyboardEvent(ptr::null_mut(), c_key_code, false);
        if key_up_event.is_null() {
            CFRelease(key_down_event as *const c_void);
            return Err("Failed to create key up event".into());
        }

        // Set Command flag
        CGEventSetFlags(key_up_event, CG_EVENT_FLAG_MASK_COMMAND);

        // Post the events with timing like Python
        CGEventPost(CG_SESSION_EVENT_TAP, key_down_event);

        // Small delay between down and up like Python does
        thread::sleep(Duration::from_millis(10));

        CGEventPost(CG_SESSION_EVENT_TAP, key_up_event);

        // Clean up
        CFRelease(key_down_event as *const c_void);
        CFRelease(key_up_event as *const c_void);
    }

    Ok(())
}

// Native macOS Cmd+X implementation using raw Quartz C API
fn native_cmd_x() -> Result<(), Box<dyn std::error::Error>> {
    unsafe {
        // Key code for 'X' is 7 on macOS
        let x_key_code: CGKeyCode = 7;

        // Create key down event for Cmd+X
        let key_down_event = CGEventCreateKeyboardEvent(ptr::null_mut(), x_key_code, true);
        if key_down_event.is_null() {
            return Err("Failed to create key down event".into());
        }

        // Set Command flag
        CGEventSetFlags(key_down_event, CG_EVENT_FLAG_MASK_COMMAND);

        // Mark this as a synthetic event to help avoid hotkey interference
        // Using user info field to mark our events (field 121 is a user data field)
        CGEventSetIntegerValueField(key_down_event, 121, 0x49544F); // 'ITO' in hex

        // Create key up event for Cmd+X
        let key_up_event = CGEventCreateKeyboardEvent(ptr::null_mut(), x_key_code, false);
        if key_up_event.is_null() {
            CFRelease(key_down_event as *const c_void);
            return Err("Failed to create key up event".into());
        }

        // Set Command flag
        CGEventSetFlags(key_up_event, CG_EVENT_FLAG_MASK_COMMAND);

        // Mark this as a synthetic event too
        CGEventSetIntegerValueField(key_up_event, 121, 0x49544F); // 'ITO' in hex

        // Post the events using session event tap instead of HID event tap
        // This might make them less visible to the global-key-listener
        CGEventPost(CG_SESSION_EVENT_TAP, key_down_event);
        thread::sleep(Duration::from_millis(10));
        CGEventPost(CG_SESSION_EVENT_TAP, key_up_event);

        // Clean up
        CFRelease(key_down_event as *const c_void);
        CFRelease(key_up_event as *const c_void);
    }

    Ok(())
}

// Double Cmd+C copy for stubborn Electron apps using native events
fn double_copy_method(clipboard: &mut Clipboard) -> Result<String, Box<dyn std::error::Error>> {
    // Clear clipboard to detect if copy operation worked
    clipboard.clear()?;

    // Perform first Cmd+C
    native_cmd_c()?;

    // Short delay between copies
    thread::sleep(Duration::from_millis(25));

    // Perform second Cmd+C
    native_cmd_c()?;

    // Slightly longer delay for double copy
    thread::sleep(Duration::from_millis(75));

    // Try to get the copied text
    match clipboard.get_text() {
        Ok(text) => Ok(text),
        Err(_) => Ok(String::new()),
    }
}

// Simple function to select previous N characters and copy them
fn select_previous_chars_and_copy(char_count: usize, clipboard: &mut Clipboard) -> Result<String, Box<dyn std::error::Error>> {
    use std::time::Instant;

    // Clear clipboard before selection
    clipboard.clear().map_err(|e| format!("Clipboard clear failed: {}", e))?;

    // Send Shift+Left N times to select precursor text (copied from working get_context)
    for i in 0..char_count {
        if i == 0 || i % 5 == 0 || i == char_count - 1 {
        }

        unsafe {
            let key_down_event = CGEventCreateKeyboardEvent(ptr::null_mut(), 123, true); // Left arrow
            let key_up_event = CGEventCreateKeyboardEvent(ptr::null_mut(), 123, false);

            if key_down_event.is_null() || key_up_event.is_null() {
                if !key_down_event.is_null() {
                    CFRelease(key_down_event as *const c_void);
                }
                if !key_up_event.is_null() {
                    CFRelease(key_up_event as *const c_void);
                }
                return Err("Failed to create shift+left event".into());
            }

            // Set Shift flag for selection
            CGEventSetFlags(key_down_event, CG_EVENT_FLAG_MASK_SHIFT);
            CGEventSetFlags(key_up_event, CG_EVENT_FLAG_MASK_SHIFT);

            // Mark as synthetic events
            CGEventSetIntegerValueField(key_down_event, 121, 0x49544F);
            CGEventSetIntegerValueField(key_up_event, 121, 0x49544F);

            // Post events using session event tap to avoid interference
            CGEventPost(CG_SESSION_EVENT_TAP, key_down_event);
            thread::sleep(Duration::from_millis(2));
            CGEventPost(CG_SESSION_EVENT_TAP, key_up_event);

            CFRelease(key_down_event as *const c_void);
            CFRelease(key_up_event as *const c_void);
        }

        // Brief pause between selections
        thread::sleep(Duration::from_millis(1));
    }

    // Allow selection to complete (match working get_context timing)
    thread::sleep(Duration::from_millis(10));

    // Copy the selected text
    let copy_start = Instant::now();
    native_cmd_c()?;
    thread::sleep(Duration::from_millis(25)); // Wait for copy to complete (match working timing)

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
    let copy_duration = copy_start.elapsed();

    // Move cursor right by the number of characters we captured to deselect
    // This prevents paste conflicts in applications that don't allow pasting over selections
    let max_chars_to_move = context_text.chars().count();
    let chars_to_move = std::cmp::min(max_chars_to_move, char_count);
    if chars_to_move > 0 {

        for i in 0..chars_to_move {
            unsafe {
                let right_arrow_key_code: CGKeyCode = 124; // Right Arrow key code
                let key_down = CGEventCreateKeyboardEvent(ptr::null_mut(), right_arrow_key_code, true);
                let key_up = CGEventCreateKeyboardEvent(ptr::null_mut(), right_arrow_key_code, false);

                if !key_down.is_null() && !key_up.is_null() {
                    // Set Shift flag to unselect the text as we move right
                    CGEventSetFlags(key_down, CG_EVENT_FLAG_MASK_SHIFT);
                    CGEventSetFlags(key_up, CG_EVENT_FLAG_MASK_SHIFT);

                    // Mark as synthetic events
                    CGEventSetIntegerValueField(key_down, 121, 0x49544F);
                    CGEventSetIntegerValueField(key_up, 121, 0x49544F);

                    CGEventPost(CG_SESSION_EVENT_TAP, key_down);
                    CGEventPost(CG_SESSION_EVENT_TAP, key_up);

                    CFRelease(key_down as *const c_void);
                    CFRelease(key_up as *const c_void);
                }
            }

            // Brief pause between movements
            if chars_to_move > 1 {
                thread::sleep(Duration::from_millis(1));
            }
        }
    } else {
    }

    // Debug: Let's also check if there's anything on the clipboard at all
    if context_text.is_empty() {
    }

    Ok(context_text)
}

pub fn get_cursor_context(context_length: usize, cut_current_selection: bool) -> Result<String, Box<dyn std::error::Error>> {
    use std::time::Instant;

    let start_time = Instant::now();

    // Use keyboard commands to get cursor context
    // This is more reliable across different applications than Accessibility API

    let clipboard_init_start = Instant::now();
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard init failed: {}", e))?;

    // Store original clipboard contents
    let get_clipboard_start = Instant::now();
    let original_clipboard = clipboard.get_text().unwrap_or_default();

    // Conditionally cut selected text based on parameter
    if cut_current_selection {
        let cut_start = Instant::now();
        native_cmd_x()?;
        thread::sleep(Duration::from_millis(25)); // Wait for cut to complete
    } else {
    }

    // Select previous context_length characters with Shift+Left and copy
    let select_context_start = Instant::now();
    let result = select_previous_chars_and_copy(context_length, &mut clipboard);

    // Always restore original clipboard
    let restore_clipboard_start = Instant::now();
    let _ = clipboard.set_text(original_clipboard);

    let total_time = start_time.elapsed();

    // Return debug info if we got nothing
    match result {
        Ok(text) => Ok(text),
        Err(e) => Ok(format!("[ERROR] {}", e)),
    }
}

fn select_line_and_get_context(
    context_length: usize,
    clipboard: &mut Clipboard,
) -> Result<String, Box<dyn std::error::Error>> {
    use std::time::Instant;

    let start_time = Instant::now();

    unsafe {
        // Key code for Left Arrow is 123 on macOS
        let left_arrow_key_code: CGKeyCode = 123;

        // Use Cmd+Shift+Left to select from cursor to beginning of line
        let key_down_event = CGEventCreateKeyboardEvent(ptr::null_mut(), left_arrow_key_code, true);
        if key_down_event.is_null() {
            return Err("Failed to create key event".into());
        }

        let key_up_event = CGEventCreateKeyboardEvent(ptr::null_mut(), left_arrow_key_code, false);
        if key_up_event.is_null() {
            CFRelease(key_down_event as *const c_void);
            return Err("Failed to create key event".into());
        }

        // Set Cmd+Shift flags (Shift: 0x20000, Cmd: 0x100000)
        let flags = 0x20000 | 0x100000;
        CGEventSetFlags(key_down_event, flags);
        CGEventSetFlags(key_up_event, flags);

        let keyboard_start = Instant::now();

        // Post the events
        CGEventPost(CG_SESSION_EVENT_TAP, key_down_event);
        thread::sleep(Duration::from_millis(5));
        CGEventPost(CG_SESSION_EVENT_TAP, key_up_event);

        // Clean up
        CFRelease(key_down_event as *const c_void);
        CFRelease(key_up_event as *const c_void);

        // Brief delay for selection to complete
        thread::sleep(Duration::from_millis(10));
        let keyboard_duration = keyboard_start.elapsed();

        let copy_start = Instant::now();

        // Copy the selection
        native_cmd_c()?;

        // Adaptively wait for and get text from clipboard
        let mut line_text = String::new();
        let max_retries = 20; // Poll for a maximum of 20 * 10ms = 200ms
        for _ in 0..max_retries {
            // Give a tiny bit of time for the clipboard to update
            thread::sleep(Duration::from_millis(10));

            if let Ok(text) = clipboard.get_text() {
                if !text.is_empty() {
                    line_text = text;
                    break; // Success! We got the text.
                }
            }
        }
        let copy_duration = copy_start.elapsed();

        // Restore cursor position with optimized single-arrow approach
        let restore_start = Instant::now();
        restore_cursor_position()?;
        let restore_duration = restore_start.elapsed();

        // Extract the last N characters from the line text (context before cursor)
        let context_text = if line_text.len() <= context_length {
            line_text.clone()
        } else {
            // Take the last context_length characters
            line_text
                .chars()
                .rev()
                .take(context_length)
                .collect::<String>()
                .chars()
                .rev()
                .collect()
        };

        let total_duration = start_time.elapsed();
        Ok(context_text)
    }
}

fn move_cursor_right(char_count: usize) -> Result<(), Box<dyn std::error::Error>> {
    if char_count == 0 {
        return Ok(());
    }

    unsafe {
        let right_arrow_key_code: CGKeyCode = 124;

        // Move right character by character to restore cursor position
        // For efficiency, we could batch this but for safety we'll do it simply
        for _ in 0..char_count {
            let key_down_event =
                CGEventCreateKeyboardEvent(ptr::null_mut(), right_arrow_key_code, true);
            let key_up_event =
                CGEventCreateKeyboardEvent(ptr::null_mut(), right_arrow_key_code, false);

            if !key_down_event.is_null() && !key_up_event.is_null() {
                CGEventPost(CG_SESSION_EVENT_TAP, key_down_event);
                CGEventPost(CG_SESSION_EVENT_TAP, key_up_event);

                CFRelease(key_down_event as *const c_void);
                CFRelease(key_up_event as *const c_void);
            }

            // Small delay between movements for very long selections
            if char_count > 50 && char_count % 10 == 0 {
                thread::sleep(Duration::from_millis(1));
            }
        }
    }

    Ok(())
}

// Optimized cursor restoration using single right-arrow press
fn restore_cursor_position() -> Result<(), Box<dyn std::error::Error>> {
    unsafe {
        let right_arrow_key_code: CGKeyCode = 124;

        let key_down = CGEventCreateKeyboardEvent(ptr::null_mut(), right_arrow_key_code, true);
        let key_up = CGEventCreateKeyboardEvent(ptr::null_mut(), right_arrow_key_code, false);

        if !key_down.is_null() && !key_up.is_null() {
            CGEventPost(CG_SESSION_EVENT_TAP, key_down);
            // No need for a delay here, it's a single atomic action
            CGEventPost(CG_SESSION_EVENT_TAP, key_up);

            CFRelease(key_down as *const c_void);
            CFRelease(key_up as *const c_void);
        }
    }
    Ok(())
}

fn restore_original_selection(
    line_char_count: usize,
    _original_selection: String,
) -> Result<(), Box<dyn std::error::Error>> {
    // For now, just move cursor to end of line and leave unselected
    // TODO: Could implement more sophisticated selection restoration if needed
    move_cursor_right(line_char_count)?;
    Ok(())
}

// New comprehensive function that gets both selected text and cursor context atomically
pub fn get_context(
    max_selected_length: Option<usize>,
    max_precursor_length: Option<usize>,
) -> Result<(String, String), Box<dyn std::error::Error>> {
    use std::time::Instant;

    let start_time = Instant::now();

    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard init failed: {}", e))?;

    // Store original clipboard contents
    let original_clipboard = clipboard.get_text().unwrap_or_default();

    // Step 1: Cut selected text with Cmd+X (removes text and positions cursor correctly)
    clipboard
        .clear()
        .map_err(|e| format!("Clipboard clear failed: {}", e))?;

    native_cmd_x()?;
    thread::sleep(Duration::from_millis(25)); // Wait for cut to complete

    let selected_text = clipboard.get_text().unwrap_or_default();

    // Step 2: Move cursor to select precursor context with Shift+Left
    let precursor_length = max_precursor_length.unwrap_or(20);

    // Clear clipboard for second copy operation
    clipboard
        .clear()
        .map_err(|e| format!("Clipboard clear failed: {}", e))?;

    // Send Shift+Left N times to select precursor text
    for i in 0..precursor_length {
        unsafe {
            let key_down_event = CGEventCreateKeyboardEvent(ptr::null_mut(), 123, true); // Left arrow
            let key_up_event = CGEventCreateKeyboardEvent(ptr::null_mut(), 123, false);

            if key_down_event.is_null() || key_up_event.is_null() {
                if !key_down_event.is_null() {
                    CFRelease(key_down_event as *const c_void);
                }
                if !key_up_event.is_null() {
                    CFRelease(key_up_event as *const c_void);
                }
                return Err("Failed to create shift+left event".into());
            }

            // Set Shift flag for selection
            CGEventSetFlags(key_down_event, CG_EVENT_FLAG_MASK_SHIFT);
            CGEventSetFlags(key_up_event, CG_EVENT_FLAG_MASK_SHIFT);

            // Mark as synthetic events
            CGEventSetIntegerValueField(key_down_event, 121, 0x49544F);
            CGEventSetIntegerValueField(key_up_event, 121, 0x49544F);

            // Post events using session event tap to avoid interference
            CGEventPost(CG_SESSION_EVENT_TAP, key_down_event);
            thread::sleep(Duration::from_millis(2));
            CGEventPost(CG_SESSION_EVENT_TAP, key_up_event);

            CFRelease(key_down_event as *const c_void);
            CFRelease(key_up_event as *const c_void);
        }

        // Brief pause between selections
        thread::sleep(Duration::from_millis(1));

        if i % 10 == 0 && i > 0 {
        }
    }

    // Step 3: Copy the precursor context with Cmd+C
    thread::sleep(Duration::from_millis(10)); // Allow selection to complete

    native_cmd_c()?;
    thread::sleep(Duration::from_millis(25)); // Wait for copy to complete

    let combined_text = clipboard.get_text().unwrap_or_default();

    // Extract precursor by taking slice from 0 to (combined_length - selected_length)
    let precursor_length = combined_text.len().saturating_sub(selected_text.len());
    let precursor_text = combined_text
        .chars()
        .take(precursor_length)
        .collect::<String>();

    // // Step 4: Restore cursor position by moving right to end of selection
    // let restore_start = Instant::now();

    // unsafe {
    //     let right_arrow_key_code: CGKeyCode = 124;
    //     let key_down = CGEventCreateKeyboardEvent(ptr::null_mut(), right_arrow_key_code, true);
    //     let key_up = CGEventCreateKeyboardEvent(ptr::null_mut(), right_arrow_key_code, false);

    //     if !key_down.is_null() && !key_up.is_null() {
    //         // Mark as synthetic events
    //         CGEventSetIntegerValueField(key_down, 121, 0x49544F);
    //         CGEventSetIntegerValueField(key_up, 121, 0x49544F);

    //         CGEventPost(CG_SESSION_EVENT_TAP, key_down);
    //         CGEventPost(CG_SESSION_EVENT_TAP, key_up);

    //         CFRelease(key_down as *const c_void);
    //         CFRelease(key_up as *const c_void);
    //     }
    // }


    // Step 5: Restore original clipboard
    let _ = clipboard.set_text(original_clipboard);

    // Apply length limits if specified
    let final_selected = if let Some(max_len) = max_selected_length {
        if selected_text.len() > max_len {
            selected_text.chars().take(max_len).collect()
        } else {
            selected_text
        }
    } else {
        selected_text
    };

    let final_precursor = if let Some(max_len) = max_precursor_length {
        if precursor_text.len() > max_len {
            // Take the last max_len characters for precursor context
            precursor_text
                .chars()
                .rev()
                .take(max_len)
                .collect::<String>()
                .chars()
                .rev()
                .collect()
        } else {
            precursor_text
        }
    } else {
        precursor_text
    };

    let total_time = start_time.elapsed();

    Ok((final_selected, final_precursor))
}

use arboard::Clipboard;
use libc::c_void;
use lru::LruCache;
use parking_lot::Mutex;
use std::ptr;
use std::thread;
use std::time::Duration;

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
    // Simple approach: use Cmd+C (copy) to get any selected text
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard init failed: {}", e))?;

    // Store original clipboard contents
    let original_clipboard = clipboard.get_text().unwrap_or_default();

    clipboard
        .clear()
        .map_err(|e| format!("Clipboard clear failed: {}", e))?;

    // Use Cmd+C to cut any selected text
    native_cmd_c()?;

    // Small delay for copy operation to complete
    thread::sleep(Duration::from_millis(25));

    // Get the copied text from clipboard (this is what was selected)
    let selected_text = clipboard.get_text().unwrap_or_default();

    // Always restore original clipboard contents - ITO is cutting on behalf of user for context
    let _ = clipboard.set_text(original_clipboard);

    Ok(selected_text)
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

// Simple function to select previous N characters and copy them
fn select_previous_chars_and_copy(
    char_count: usize,
    clipboard: &mut Clipboard,
) -> Result<String, Box<dyn std::error::Error>> {
    // Send Shift+Left N times to select precursor text (copied from working get_context)
    for i in 0..char_count {
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

    native_cmd_c()?;

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

pub fn get_cursor_context(context_length: usize) -> Result<String, Box<dyn std::error::Error>> {
    // Use keyboard commands to get cursor context
    // This is more reliable across different applications than Accessibility API
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard init failed: {}", e))?;

    // Store original clipboard contents
    let original_clipboard = clipboard.get_text().unwrap_or_default();

    // First, get any existing selected text
    clipboard
        .clear()
        .map_err(|e| format!("Clipboard clear failed: {}", e))?;
    native_cmd_c()?;
    thread::sleep(Duration::from_millis(25));
    let selected_text = clipboard.get_text().unwrap_or_default();
    let selected_char_count = selected_text.chars().count();

    let context_text = if selected_char_count == 0 {
        // Case 1: No selected text - proceed normally with cursor context
        clipboard
            .clear()
            .map_err(|e| format!("Clipboard clear failed: {}", e))?;

        let result = select_previous_chars_and_copy(context_length, &mut clipboard);
        match result {
            Ok(precursor_text) => {
                let precursor_char_count = precursor_text.chars().count();
                // Shift right by the amount we grabbed
                if precursor_char_count > 0 {
                    let _ = shift_cursor_right_with_deselect(precursor_char_count);
                }
                precursor_text
            }
            Err(e) => format!("[ERROR] {}", e),
        }
    } else {
        // Case 2: Some text already selected - try extending by one character
        clipboard
            .clear()
            .map_err(|e| format!("Clipboard clear failed: {}", e))?;

        let result = select_previous_chars_and_copy(1, &mut clipboard);
        match result {
            Ok(extended_text) => {
                let extended_char_count = extended_text.chars().count();

                if extended_char_count < selected_char_count {
                    // Selection shrunk - undo and return empty
                    let _ = shift_cursor_right_with_deselect(1);
                    String::new()
                } else if extended_char_count == selected_char_count {
                    // Selection unchanged - return empty, no need to return cursor
                    String::new()
                } else {
                    // Selection extended successfully - continue extending to get full context_length
                    clipboard
                        .clear()
                        .map_err(|e| format!("Clipboard clear failed: {}", e))?;

                    let full_result = select_previous_chars_and_copy(context_length, &mut clipboard);
                    match full_result {
                        Ok(full_context_text) => {
                            let full_context_char_count = full_context_text.chars().count();
                            // Undo by the absolute difference between original selected text and total selection
                            let chars_to_undo = (full_context_char_count as i32 - selected_char_count as i32).abs() as usize;
                            if chars_to_undo > 0 {
                                let _ = shift_cursor_right_with_deselect(chars_to_undo);
                            }

                            // Return only the newly added context (first n characters where n is the difference)
                            let new_context_char_count = full_context_char_count - selected_char_count;
                            full_context_text.chars().take(new_context_char_count).collect()
                        }
                        Err(e) => format!("[ERROR] {}", e)
                    }
                }
            }
            Err(e) => format!("[ERROR] {}", e),
        }
    };

    // Always restore original clipboard
    let _ = clipboard.set_text(original_clipboard);

    Ok(context_text)
}

// Shift cursor right while deselecting text
fn shift_cursor_right_with_deselect(char_count: usize) -> Result<(), Box<dyn std::error::Error>> {
    if char_count == 0 {
        return Ok(());
    }

    for i in 0..char_count {
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
        if char_count > 1 {
            thread::sleep(Duration::from_millis(1));
        }
    }

    Ok(())
}

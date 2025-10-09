use arboard::Clipboard;
use libc::c_void;
use std::ptr;
use std::thread;
use std::time::Duration;

// Count characters as the editor sees them (on macOS, just use normal char
// count)
pub fn count_editor_chars(text: &str) -> usize {
    text.chars().count()
}

// Raw Quartz C API bindings for CGEventCreateKeyboardEvent
#[repr(C)]
struct __CGEvent(c_void);
type CGEventRef = *mut __CGEvent;

type CGKeyCode = u16;
type CGEventFlags = u64;
const CG_EVENT_FLAG_MASK_COMMAND: CGEventFlags = 0x100000;
const CG_EVENT_FLAG_MASK_SHIFT: CGEventFlags = 0x020000;

type CGEventTapLocation = u32;
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

    // Always restore original clipboard contents - ITO is cutting on behalf of user
    // for context
    let _ = clipboard.set_text(original_clipboard);

    Ok(selected_text)
}

// Native macOS Cmd+C implementation using raw Quartz C API - matching Python
// exactly
pub fn native_cmd_c() -> Result<(), Box<dyn std::error::Error>> {
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
pub fn select_previous_chars_and_copy(
    char_count: usize,
    clipboard: &mut Clipboard,
) -> Result<String, Box<dyn std::error::Error>> {
    // Send Shift+Left N times to select precursor text (copied from working
    // get_context)
    for _i in 0..char_count {
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

// Shift cursor right while deselecting text
pub fn shift_cursor_right_with_deselect(
    char_count: usize,
) -> Result<(), Box<dyn std::error::Error>> {
    if char_count == 0 {
        return Ok(());
    }

    for _i in 0..char_count {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_count_editor_chars() {
        assert_eq!(count_editor_chars("hello"), 5);
        assert_eq!(count_editor_chars("Hello 世界"), 8);
        assert_eq!(count_editor_chars("Hi 👋"), 4);
        assert_eq!(count_editor_chars(""), 0);
    }
}

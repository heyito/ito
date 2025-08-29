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

type CGEventTapLocation = u32;
const CG_HID_EVENT_TAP: CGEventTapLocation = 0;

extern "C" {
    fn CGEventCreateKeyboardEvent(
        source: *mut c_void,
        virtualKey: CGKeyCode,
        keyDown: bool,
    ) -> CGEventRef;
    fn CGEventSetFlags(event: CGEventRef, flags: CGEventFlags);
    fn CGEventPost(tap: CGEventTapLocation, event: CGEventRef);
    fn CFRelease(cf: *const c_void);
}

pub fn get_selected_text() -> Result<String, Box<dyn std::error::Error>> {
    // Initialize cache if needed
    if GET_SELECTED_TEXT_METHOD.lock().is_none() {
        let cache = LruCache::new(NonZeroUsize::new(100).unwrap());
        *GET_SELECTED_TEXT_METHOD.lock() = Some(cache);
    }

    let mut cache = GET_SELECTED_TEXT_METHOD.lock();
    let cache = cache.as_mut().unwrap();

    // Get the active application name
    let app_name = match get_active_window() {
        Ok(window) => window.app_name,
        Err(_) => return Err("No active window found".into()),
    };

    // Check cache for preferred method for this app
    if let Some(method) = cache.get(&app_name) {
        if *method == 0 {
            // Try AX method first
            match get_selected_text_by_ax() {
                Ok(text) if !text.is_empty() => return Ok(text),
                _ => {} // Fall through to try other methods
            }
        } else {
            // Try clipboard method first
            match get_selected_text_by_clipboard_macos() {
                Ok(text) if !text.is_empty() => return Ok(text),
                _ => {} // Fall through to try other methods
            }
        }
    }

    // No cached preference - try AX method first
    match get_selected_text_by_ax() {
        Ok(text) => {
            if !text.is_empty() {
                cache.put(app_name, 0); // Remember AX works for this app
                return Ok(text);
            }
        }
        Err(_) => {}
    }

    // AX failed or returned empty, try clipboard method
    match get_selected_text_by_clipboard_macos() {
        Ok(text) => {
            if !text.is_empty() {
                cache.put(app_name, 1); // Remember clipboard works for this app
                return Ok(text);
            }
        }
        Err(_) => {}
    }

    // Both AX and clipboard failed, try AppleScript as last resort
    get_selected_text_by_clipboard_using_applescript()
}

// Direct accessibility framework method
fn get_selected_text_by_ax() -> Result<String, Box<dyn std::error::Error>> {
    let system_element = AXUIElement::system_wide();
    let Some(selected_element) = system_element
        .attribute(&AXAttribute::new(&CFString::from_static_string(
            kAXFocusedUIElementAttribute,
        )))
        .map(|element| element.downcast_into::<AXUIElement>())
        .ok()
        .flatten()
    else {
        return Err(Box::new(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "No selected element",
        )));
    };

    let Some(selected_text) = selected_element
        .attribute(&AXAttribute::new(&CFString::from_static_string(
            kAXSelectedTextAttribute,
        )))
        .map(|text| text.downcast_into::<CFString>())
        .ok()
        .flatten()
    else {
        return Err(Box::new(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "No selected text",
        )));
    };

    Ok(selected_text.to_string())
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
        CGEventPost(CG_HID_EVENT_TAP, key_down_event);

        // Small delay between down and up like Python does
        thread::sleep(Duration::from_millis(10));

        CGEventPost(CG_HID_EVENT_TAP, key_up_event);

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

// AppleScript fallback for macOS when both AX and clipboard methods fail
const APPLE_SCRIPT: &str = r#"
use AppleScript version "2.4"
use scripting additions
use framework "Foundation"
use framework "AppKit"

set savedAlertVolume to alert volume of (get volume settings)

-- Back up clipboard contents:
set savedClipboard to the clipboard

set thePasteboard to current application's NSPasteboard's generalPasteboard()
set theCount to thePasteboard's changeCount()

tell application "System Events"
    set volume alert volume 0
end tell

-- Copy selected text to clipboard:
tell application "System Events" to keystroke "c" using {command down}
delay 0.1 -- Without this, the clipboard may have stale data.

tell application "System Events"
    set volume alert volume savedAlertVolume
end tell

if thePasteboard's changeCount() is theCount then
    return ""
end if

set theSelectedText to the clipboard

set the clipboard to savedClipboard

theSelectedText
"#;

fn get_selected_text_by_clipboard_using_applescript() -> Result<String, Box<dyn std::error::Error>>
{
    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg(APPLE_SCRIPT)
        .output()?;
    if output.status.success() {
        let content = String::from_utf8(output.stdout)?;
        let content = content.trim();
        Ok(content.to_string())
    } else {
        let err = output
            .stderr
            .into_iter()
            .map(|c| c as char)
            .collect::<String>()
            .into();
        Err(err)
    }
}

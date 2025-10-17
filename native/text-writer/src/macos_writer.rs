#[cfg(target_os = "macos")]
use cocoa::appkit::{NSPasteboard, NSPasteboardTypeString};
use cocoa::base::nil;
use cocoa::foundation::{NSAutoreleasePool, NSString};
use core_graphics::event::{CGEvent, CGEventFlags};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use std::thread;
use std::time::Duration;

/// Type text on macOS using clipboard paste approach
/// This avoids character-by-character typing which can cause issues in some
/// apps
pub fn type_text_macos(text: &str, _char_delay: u64) -> Result<(), String> {
    unsafe {
        // Create an autorelease pool for memory management
        let _pool = NSAutoreleasePool::new(nil);

        // Get the general pasteboard
        let pasteboard = NSPasteboard::generalPasteboard(nil);

        // Store current clipboard contents to restore later
        let old_contents = pasteboard.stringForType(NSPasteboardTypeString);

        // Clear the pasteboard and set our text
        pasteboard.clearContents();
        let ns_string = NSString::alloc(nil).init_str(text);
        pasteboard.setString_forType(ns_string, NSPasteboardTypeString);

        // Verify clipboard was actually set by reading it back
        let mut attempts = 0;
        loop {
            let current_content = pasteboard.stringForType(NSPasteboardTypeString);
            if current_content != nil {
                let current_str = cocoa::foundation::NSString::UTF8String(current_content);
                let current_rust_str = std::ffi::CStr::from_ptr(current_str)
                    .to_string_lossy()
                    .into_owned();
                if current_rust_str == text {
                    break;
                }
            }

            attempts += 1;
            if attempts > 50 {
                return Err("Failed to verify clipboard content was set".to_string());
            }
            thread::sleep(Duration::from_millis(2));
        }

        // Create event source
        let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState)
            .map_err(|_| "Failed to create event source")?;

        // Simulate Cmd+V (paste)
        // Key code 9 is 'V' key
        let key_v_down = CGEvent::new_keyboard_event(source.clone(), 9, true)
            .map_err(|_| "Failed to create key down event")?;
        let key_v_up = CGEvent::new_keyboard_event(source.clone(), 9, false)
            .map_err(|_| "Failed to create key up event")?;

        // Set the Command modifier flag
        key_v_down.set_flags(CGEventFlags::CGEventFlagCommand);
        key_v_up.set_flags(CGEventFlags::CGEventFlagCommand);

        // Post the events
        key_v_down.post(core_graphics::event::CGEventTapLocation::HID);
        thread::sleep(Duration::from_millis(10));
        key_v_up.post(core_graphics::event::CGEventTapLocation::HID);

        // Restore old clipboard contents in background after delay in separate thread
        // to not block
        if old_contents != nil {
            // Convert Objective-C string to Rust String to make it Send-safe
            let old_contents_str = {
                let c_str = cocoa::foundation::NSString::UTF8String(old_contents);
                std::ffi::CStr::from_ptr(c_str)
                    .to_string_lossy()
                    .into_owned()
            };

            thread::sleep(Duration::from_secs(1));
            let pasteboard = NSPasteboard::generalPasteboard(nil);
            pasteboard.clearContents();
            let ns_string = NSString::alloc(nil).init_str(&old_contents_str);
            pasteboard.setString_forType(ns_string, NSPasteboardTypeString);
        }

        Ok(())
    }
}

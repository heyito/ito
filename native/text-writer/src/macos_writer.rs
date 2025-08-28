#[cfg(target_os = "macos")]
use cocoa::appkit::{NSPasteboard, NSPasteboardTypeString};
use cocoa::base::nil;
use cocoa::foundation::{NSString, NSAutoreleasePool};
use core_graphics::event::{CGEvent, CGEventFlags};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use std::thread;
use std::time::Duration;

/// Type text on macOS using clipboard paste approach
/// This avoids character-by-character typing which can cause issues in some apps
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
        
        // Small delay to ensure clipboard is set
        thread::sleep(Duration::from_millis(10));
        
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
        
        // Wait a bit for paste to complete
        thread::sleep(Duration::from_millis(50));
        
        // Restore old clipboard contents if there were any
        if old_contents != nil {
            pasteboard.clearContents();
            pasteboard.setString_forType(old_contents, NSPasteboardTypeString);
        }
        
        Ok(())
    }
}
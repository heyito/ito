use std::fs::OpenOptions;
use std::io::Write;
use chrono::Utc;

#[cfg(target_os = "windows")]
use windows::{
    core::*,
    Win32::System::Com::*,
    Win32::UI::Accessibility::*,
};

// Helper function to write to log file
fn log_to_file(message: &str) {
    let log_path = std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("selected-text-reader-debug.log");

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_path) {
        let timestamp = Utc::now().to_rfc3339();
        let _ = writeln!(file, "[{}] {}", timestamp, message);
        let _ = file.flush();
    }
}

// Use UI Automation API only (no keyboard simulation)
pub fn get_selected_text() -> std::result::Result<String, Box<dyn std::error::Error>> {
    get_selected_text_ui_automation()
}

#[cfg(target_os = "windows")]
fn get_selected_text_ui_automation() -> std::result::Result<String, Box<dyn std::error::Error>> {
    log_to_file("🔍 Starting UI Automation selected text reading");

    unsafe {
        // Initialize COM
        log_to_file("⚙️ Initializing COM");
        let com_result = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        if com_result.is_err() {
            log_to_file(&format!("❌ COM initialization failed: {:?}", com_result));
            return Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, format!("COM initialization failed: {:?}", com_result))));
        }
        log_to_file("✅ COM initialized successfully");

        // Create UI Automation instance
        log_to_file("⚙️ Creating UI Automation instance");
        let automation: IUIAutomation = match CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) {
            Ok(a) => {
                log_to_file("✅ UI Automation instance created");
                a
            },
            Err(e) => {
                log_to_file(&format!("❌ Failed to create UI Automation instance: {:?}", e));
                CoUninitialize();
                return Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to create UI Automation instance: {:?}", e))));
            }
        };

        // Get the focused element
        log_to_file("🎯 Getting focused element");
        let focused_element = match automation.GetFocusedElement() {
            Ok(element) => {
                log_to_file("✅ Focused element retrieved");
                element
            },
            Err(e) => {
                log_to_file(&format!("❌ Failed to get focused element: {:?}", e));
                CoUninitialize();
                return Err(format!("Failed to get focused element: {:?}", e).into());
            }
        };

        // Try to get selection pattern
        log_to_file("🔍 Trying selection pattern");
        if let Ok(selection_pattern) = focused_element.GetCurrentPattern(UIA_SelectionPatternId) {
            log_to_file("✅ Selection pattern found");
            let selection: IUIAutomationSelectionPattern = selection_pattern.cast().map_err(|e| format!("Failed to cast to selection pattern: {:?}", e))?;
            let selections = selection.GetCurrentSelection().map_err(|e| format!("Failed to get current selection: {:?}", e))?;
            let selection_count = selections.Length().map_err(|e| format!("Failed to get selection count: {:?}", e))?;
            log_to_file(&format!("📊 Found {} selections", selection_count));

            let mut selected_text = String::new();
            for i in 0..selection_count {
                log_to_file(&format!("🔍 Processing selection {}", i));
                if let Ok(element) = selections.GetElement(i) {
                    if let Ok(text_pattern) = element.GetCurrentPattern(UIA_TextPatternId) {
                        log_to_file("✅ Text pattern found on selection element");
                        let text: IUIAutomationTextPattern = text_pattern.cast().map_err(|e| format!("Failed to cast to text pattern: {:?}", e))?;
                        let selection_ranges = text.GetSelection().map_err(|e| format!("Failed to get text selection: {:?}", e))?;
                        let range_count = selection_ranges.Length().map_err(|e| format!("Failed to get range count: {:?}", e))?;
                        log_to_file(&format!("📊 Found {} text ranges", range_count));

                        for j in 0..range_count {
                            if let Ok(range) = selection_ranges.GetElement(j) {
                                if let Ok(text_value) = range.GetText(-1) {
                                    let text_str = text_value.to_string();
                                    log_to_file(&format!("📝 Found text: '{}'", text_str));
                                    selected_text.push_str(&text_str);
                                }
                            }
                        }
                    }
                }
            }

            if !selected_text.is_empty() {
                log_to_file(&format!("✅ Selection pattern successful, returning: '{}'", selected_text));
                CoUninitialize();
                return Ok(selected_text);
            }
            log_to_file("⚠️ Selection pattern found but no text extracted");
        } else {
            log_to_file("❌ No selection pattern available");
        }

        // Try Value pattern for text inputs
        log_to_file("🔍 Trying value pattern");
        if let Ok(value_pattern) = focused_element.GetCurrentPattern(UIA_ValuePatternId) {
            log_to_file("✅ Value pattern found");
            let value: IUIAutomationValuePattern = value_pattern.cast().map_err(|e| format!("Failed to cast to value pattern: {:?}", e))?;
            if let Ok(text) = value.CurrentValue() {
                let text_str = text.to_string();
                log_to_file(&format!("✅ Value pattern successful, returning: '{}'", text_str));
                CoUninitialize();
                return Ok(text_str);
            } else {
                log_to_file("❌ Value pattern found but no text available");
            }
        } else {
            log_to_file("❌ No value pattern available");
        }

        log_to_file("❌ No text found via any UI Automation pattern");
        CoUninitialize();
        Err("No selected text found via UI Automation".into())
    }
}

#[cfg(not(target_os = "windows"))]
fn get_selected_text_ui_automation() -> std::result::Result<String, Box<dyn std::error::Error>> {
    Err("UI Automation only available on Windows".into())
}

pub fn get_cursor_context(context_length: usize) -> std::result::Result<String, Box<dyn std::error::Error>> {
    log_to_file(&format!("🔍 Cursor context requested (length: {})", context_length));
    // For now, return empty string to avoid keyboard simulation during hotkey testing
    log_to_file("⚠️ Cursor context disabled during UI Automation testing");
    Ok(String::new())
}
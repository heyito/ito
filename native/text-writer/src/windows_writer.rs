#[cfg(target_os = "windows")]
use std::thread;
use std::time::Duration;
use windows::Win32::UI::Input::KeyboardAndMouse::*;

/// Type text on Windows using native SendInput API
/// This uses Windows API directly to avoid clipboard and reduce antivirus false positives
pub fn type_text_windows(text: &str, char_delay: u64) -> Result<(), String> {
    unsafe {
        for ch in text.chars() {
            // Create keyboard input event for the character
            let mut inputs = vec![];

            // Key down event
            inputs.push(INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VIRTUAL_KEY(0),
                        wScan: ch as u16,
                        dwFlags: KEYBD_EVENT_FLAGS(KEYEVENTF_UNICODE.0),
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            });

            // Key up event
            inputs.push(INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VIRTUAL_KEY(0),
                        wScan: ch as u16,
                        dwFlags: KEYBD_EVENT_FLAGS(KEYEVENTF_UNICODE.0 | KEYEVENTF_KEYUP.0),
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            });

            let result = SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);

            if result == 0 {
                return Err(format!("Failed to send input for character '{}'", ch));
            }

            if char_delay > 0 {
                thread::sleep(Duration::from_millis(char_delay));
            }
        }

        Ok(())
    }
}

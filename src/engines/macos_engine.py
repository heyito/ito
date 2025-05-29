import json
import logging
import os
import subprocess
import time

import Quartz
from AppKit import NSPasteboard, NSStringPboardType

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

KEY_MAP = {
    "enter": 0x24,
    "return": 0x24,
    "tab": 0x30,
    "space": 0x31,
    "escape": 0x35,
    "delete": 0x33,
    "backspace": 0x33,
    "left": 0x7B,
    "right": 0x7C,
    "down": 0x7D,
    "up": 0x7E,
    "a": 0x00,
    "c": 0x08,
    "v": 0x09,
}

MODIFIER_MAP = {
    "cmd": Quartz.kCGEventFlagMaskCommand,
    "shift": Quartz.kCGEventFlagMaskShift,
    "alt": Quartz.kCGEventFlagMaskAlternate,
    "ctrl": Quartz.kCGEventFlagMaskControl,
}

DEV_MODE = os.getenv("DEV")


class MacOSEngine:
    def __init__(self):
        # Path to your built Swift binary
        if DEV_MODE:
            self.swift_helper_path = os.path.join(
                os.path.dirname(__file__),
                "..",
                "swift_helper",
                ".build",
                "apple",
                "Products",
                "Release",
                "inten_macos_agent",
            )
        else:
            self.swift_helper_path = (
                "/Applications/Inten.app/Contents/Resources/inten_macos_agent"
            )

    def _click_at(self, x, y):
        for event_type in [
            Quartz.kCGEventMouseMoved,
            Quartz.kCGEventLeftMouseDown,
            Quartz.kCGEventLeftMouseUp,
        ]:
            event = Quartz.CGEventCreateMouseEvent(
                None, event_type, (x, y), Quartz.kCGMouseButtonLeft
            )
            Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
        time.sleep(0.1)

    def _type_text(self, text):
        for char in text:
            down = Quartz.CGEventCreateKeyboardEvent(None, 0, True)
            up = Quartz.CGEventCreateKeyboardEvent(None, 0, False)
            Quartz.CGEventKeyboardSetUnicodeString(down, 1, char)
            Quartz.CGEventKeyboardSetUnicodeString(up, 1, char)
            Quartz.CGEventPost(Quartz.kCGHIDEventTap, down)
            Quartz.CGEventPost(Quartz.kCGHIDEventTap, up)
            time.sleep(0.01)

    def _send_shortcut(self, modifiers: list[str], keycode: int):
        """
        Example: _send_shortcut(['command'], 0x00)  => Cmd+A
        """
        flags = 0
        for mod in modifiers:
            if mod == "command":
                flags |= Quartz.kCGEventFlagMaskCommand
            elif mod == "shift":
                flags |= Quartz.kCGEventFlagMaskShift
            elif mod == "option":
                flags |= Quartz.kCGEventFlagMaskAlternate
            elif mod == "control":
                flags |= Quartz.kCGEventFlagMaskControl

        down = Quartz.CGEventCreateKeyboardEvent(None, keycode, True)
        up = Quartz.CGEventCreateKeyboardEvent(None, keycode, False)
        Quartz.CGEventSetFlags(down, flags)
        Quartz.CGEventSetFlags(up, flags)

        Quartz.CGEventPost(Quartz.kCGHIDEventTap, down)
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, up)

    def get_active_window_info(self) -> str:
        try:
            start_time = time.perf_counter()
            result = subprocess.run(
                [self.swift_helper_path, "get-window-info"],
                capture_output=True,
                text=True,
                check=True,
            )
            end_time = time.perf_counter()
            elapsed_ms = (end_time - start_time) * 1000  # Convert to milliseconds
            logger.info(f"Swift helper execution time: {elapsed_ms:.2f} ms")

            window_info = json.loads(result.stdout)

            return window_info

        except subprocess.CalledProcessError as e:
            logger.error(f"Swift helper error: {e.stderr}")
            return None
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON output from Swift helper: {result.stdout}")
            return None

    def click_at_cursor(self):
        """
        Clicks where the cursor is currently located.
        """
        event = Quartz.CGEventCreate(None)  # Create a null event to query global state
        current_pos = Quartz.CGEventGetLocation(event)
        x, y = current_pos.x, current_pos.y
        self._click_at(x, y)
        logger.info(f"Clicked at cursor position: ({x}, {y})")
        pass

    def click_at_global(self, x, y):
        """
        Clicks at the given (x, y) coordinate relative to the current screen.
        """
        self._click_at(x, y)
        logger.info(f"Clicked at ({x}, {y})")

    def type_text_global(self, x, y, text):
        """
        Types the given text at the (x, y) coordinate.
        """
        self._click_at(x, y)
        time.sleep(0.4)  # Give some time for the click to register
        self._type_text(text)
        logger.info(f"Typed at ({x}, {y}): {text}")

    def replace_text_at_global(self, x, y, text):
        self._click_at(x, y)
        self._send_shortcut(["command"], 0x00)  # Cmd+A
        time.sleep(0.3)
        self._send_shortcut([], 0x33)  # Delete
        time.sleep(0.3)
        self._type_text(text)
        logger.info(f"Replaced text at ({x}, {y}): {text}")

    def press_key(self, key: str):
        """
        Presses a single key, with optional modifiers like 'cmd+a', 'shift+enter', etc.
        """
        key = key.strip().lower()

        # Split modifiers (e.g. 'cmd+shift+a')
        parts = key.split("+")
        modifiers = []
        main_key = parts[-1]
        if len(parts) > 1:
            for mod in parts[:-1]:
                if mod in ["cmd", "command"]:
                    modifiers.append("command")
                elif mod == "shift":
                    modifiers.append("shift")
                elif mod in ["alt", "option"]:
                    modifiers.append("option")
                elif mod in ["ctrl", "control"]:
                    modifiers.append("control")

        # Map characters or special keys to virtual key codes
        keycode_map = {
            "a": 0x00,
            "s": 0x01,
            "d": 0x02,
            "f": 0x03,
            "h": 0x04,
            "g": 0x05,
            "z": 0x06,
            "x": 0x07,
            "c": 0x08,
            "v": 0x09,
            "b": 0x0B,
            "q": 0x0C,
            "w": 0x0D,
            "e": 0x0E,
            "r": 0x0F,
            "y": 0x10,
            "t": 0x11,
            "1": 0x12,
            "2": 0x13,
            "3": 0x14,
            "4": 0x15,
            "6": 0x16,
            "5": 0x17,
            "equal": 0x18,
            "9": 0x19,
            "7": 0x1A,
            "minus": 0x1B,
            "8": 0x1C,
            "0": 0x1D,
            "rightbracket": 0x1E,
            "o": 0x1F,
            "u": 0x20,
            "leftbracket": 0x21,
            "i": 0x22,
            "p": 0x23,
            "return": 0x24,
            "l": 0x25,
            "j": 0x26,
            "quote": 0x27,
            "k": 0x28,
            "semicolon": 0x29,
            "backslash": 0x2A,
            "comma": 0x2B,
            "slash": 0x2C,
            "n": 0x2D,
            "m": 0x2E,
            "period": 0x2F,
            "tab": 0x30,
            "space": 0x31,
            "delete": 0x33,
            "escape": 0x35,
            "command": 0x37,
            "shift": 0x38,
            "capslock": 0x39,
            "option": 0x3A,
            "control": 0x3B,
            "rightshift": 0x3C,
            "rightoption": 0x3D,
            "rightcontrol": 0x3E,
            "function": 0x3F,
            "f17": 0x40,
            "volumeup": 0x48,
            "volumedown": 0x49,
            "mute": 0x4A,
            "f18": 0x4F,
            "f19": 0x50,
            "f20": 0x5A,
            "f5": 0x60,
            "f6": 0x61,
            "f7": 0x62,
            "f3": 0x63,
            "f8": 0x64,
            "f9": 0x65,
            "f11": 0x67,
            "f13": 0x69,
            "f16": 0x6A,
            "f14": 0x6B,
            "f10": 0x6D,
            "f12": 0x6F,
            "f15": 0x71,
            "help": 0x72,
            "home": 0x73,
            "pageup": 0x74,
            "forwarddelete": 0x75,
            "f4": 0x76,
            "end": 0x77,
            "f2": 0x78,
            "pagedown": 0x79,
            "f1": 0x7A,
            "left": 0x7B,
            "right": 0x7C,
            "down": 0x7D,
            "up": 0x7E,
            "enter": 0x24,
        }

        # Resolve to keycode
        keycode = keycode_map.get(main_key)
        if keycode is None:
            logger.error(f"Unknown key: {main_key}")
            return

        # Send the keypress with modifiers
        self._send_shortcut(modifiers, keycode)
        logger.info(f"Pressed key: {key} (keycode: {keycode})")

    def copy_text_from_active_app(self) -> str:
        """
        Attempts to "Select All" (Cmd+A) and then "Copy" (Cmd+C) text
        from the currently active application, then returns the copied text.
        Returns an empty string if no text is copied or an error occurs.
        """
        logger.info(
            "Attempting to select all and copy text from the active application..."
        )

        pasteboard = NSPasteboard.generalPasteboard()
        pasteboard.clearContents()

        self._send_shortcut(["command"], KEY_MAP["a"])
        time.sleep(0.3)

        self._send_shortcut(["command"], KEY_MAP["c"])
        time.sleep(0.2)

        # 3. Get text from clipboard

        available_types = pasteboard.types()
        if NSStringPboardType in available_types:
            copied_text_obj = pasteboard.stringForType_(NSStringPboardType)
            if copied_text_obj is not None:
                copied_text = str(copied_text_obj)
                logger.info(
                    f"Text copied successfully (first 50 chars): '{copied_text[:50].replace(os.linesep, ' ')}...'"
                )
                return copied_text
            else:
                logger.warning(
                    "NSStringPboardType was available, but stringForType_ returned None (no text content)."
                )
                return ""
        else:
            logger.warning(
                f"NSStringPboardType not found in clipboard. Available types: {available_types}"
            )
            return ""

    def paste_text_to_active_app(self, text_to_paste: str):
        """
        Pastes the given text into the currently active application.
        It does this by setting the clipboard content and then simulating Cmd+V.
        """

        logger.info(
            f"Attempting to paste text (first 50 chars): '{text_to_paste[:50].replace(os.linesep, ' ')}...'"
        )

        pasteboard = NSPasteboard.generalPasteboard()
        pasteboard.clearContents()
        # Prepare the data for the pasteboard
        success = pasteboard.declareTypes_owner_([NSStringPboardType], None)
        if success:
            success = pasteboard.setString_forType_(text_to_paste, NSStringPboardType)

        if not success:
            logger.error("Failed to set text on the pasteboard.")
            return False

        time.sleep(0.1)

        self._send_shortcut(["command"], KEY_MAP["a"])
        self._send_shortcut(["command"], KEY_MAP["v"])

        # Allow a moment for paste to occur
        time.sleep(0.1)
        logger.info("Paste command sent.")
        return True


if __name__ == "__main__":
    time.sleep(5)  # Give you 5 seconds to switch apps if needed

    start_time = time.perf_counter()  # More accurate than time.time()

    engine = MacOSEngine()
    info = engine.get_active_window_info()

    logger.info(f"Info: {info}")

    end_time = time.perf_counter()
    elapsed_ms = (end_time - start_time) * 1000  # Convert to milliseconds
    target = None

    for item in info["ocr_to_element_mappings"]:
        if item["ocr_text"] == "New meeting":
            target = item
            break

    if target:
        logger.info(f"Found target: {target}")
    else:
        logger.error("Target not found")
        raise Exception("Target not found")

    frame = target["matched_element"]["frame"]

    engine.click_at_global(frame["center_x"], frame["center_y"])

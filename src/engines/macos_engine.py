import subprocess
import json
import os
import time
import Quartz
import os
import subprocess
import json
from src.handlers.llm_handler import LLMHandler
class MacOSEngine:
    def __init__(self):
        # Path to your built Swift binary
        self.swift_helper_path = os.path.join(
            os.path.dirname(__file__),
            "..", "swift_helper", ".build", "apple", "Products", "Release", "macos_agent"
        )

    def get_active_window_info(self):
        try:
            result = subprocess.run(
                [self.swift_helper_path, "get-window-info"],
                capture_output=True,
                text=True,
                check=True
            )
            return json.loads(result.stdout)
        except subprocess.CalledProcessError as e:
            print(f"Swift helper error: {e.stderr}")
            return None
        except json.JSONDecodeError:
            print(f"Invalid JSON output from Swift helper: {result.stdout}")
            return None

    def click_at_global(self, x, y):
        """
        Clicks at the given (x, y) coordinate relative to the current screen.
        """
        # Move mouse to position
        move = Quartz.CGEventCreateMouseEvent(
            None,
            Quartz.kCGEventMouseMoved,
            (x, y),
            Quartz.kCGMouseButtonLeft
        )
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, move)

        # Mouse down
        click_down = Quartz.CGEventCreateMouseEvent(
            None,
            Quartz.kCGEventLeftMouseDown,
            (x, y),
            Quartz.kCGMouseButtonLeft
        )
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, click_down)

        # Small delay
        Quartz.CGEventSetIntegerValueField(click_down, Quartz.kCGMouseEventPressure, 1)

        # Mouse up
        click_up = Quartz.CGEventCreateMouseEvent(
            None,
            Quartz.kCGEventLeftMouseUp,
            (x, y),
            Quartz.kCGMouseButtonLeft
        )
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, click_up)

        print(f"✅ Python clicked at ({x}, {y})")

    def type_text_global(self, x, y, text):
        """
        Types the given text at the (x, y) coordinate.
        """
        # Step 1: Move and click at the (x, y) to focus the input
        move = Quartz.CGEventCreateMouseEvent(
            None,
            Quartz.kCGEventMouseMoved,
            (x, y),
            Quartz.kCGMouseButtonLeft
        )
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, move)

        click_down = Quartz.CGEventCreateMouseEvent(
            None,
            Quartz.kCGEventLeftMouseDown,
            (x, y),
            Quartz.kCGMouseButtonLeft
        )
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, click_down)

        click_up = Quartz.CGEventCreateMouseEvent(
            None,
            Quartz.kCGEventLeftMouseUp,
            (x, y),
            Quartz.kCGMouseButtonLeft
        )
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, click_up)

        time.sleep(0.1)  # brief pause after click to focus field

        # Step 2: Type each character
        for char in text:
            # Create a keyboard event
            event_down = Quartz.CGEventCreateKeyboardEvent(None, 0, True)
            event_up = Quartz.CGEventCreateKeyboardEvent(None, 0, False)

            # Set the character to type
            chars = (char,)
            Quartz.CGEventKeyboardSetUnicodeString(event_down, len(chars), chars)
            Quartz.CGEventKeyboardSetUnicodeString(event_up, len(chars), chars)

            Quartz.CGEventPost(Quartz.kCGHIDEventTap, event_down)
            Quartz.CGEventPost(Quartz.kCGHIDEventTap, event_up)

            time.sleep(0.01)  # tiny delay between keystrokes for reliability

        print(f"✅ Python typed at ({x}, {y}): {text}")

if __name__ == "__main__":
    time.sleep(5)  # Give you 5 seconds to switch apps if needed

    start_time = time.perf_counter()  # More accurate than time.time()

    engine = MacOSEngine()
    info = engine.get_active_window_info()

    print(f"Info: {info}")

    end_time = time.perf_counter()
    elapsed_ms = (end_time - start_time) * 1000  # Convert to milliseconds
    target = None

    for item in info["ocr_to_element_mappings"]:
        if item["ocr_text"] == "New meeting":
            target = item
            break

    if target:
        print(f"Found target: {target}")
    else:
        print("Target not found")
        raise Exception("Target not found")

    frame = target["matched_element"]["frame"]

    engine.click_at_global(frame["center_x"], frame["center_y"])

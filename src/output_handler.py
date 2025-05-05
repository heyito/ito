import platform
import time

import pyautogui
import pyperclip


def output_text(text: str, method: str = 'typewrite'):
    """
    Outputs the given text using the specified method (typing or clipboard).
    """
    if not text:
        print("Output Handler: Received empty text.")
        return

    print(f"Outputting text using method: {method}")
    try:
        # Add a small delay to allow user to switch focus if needed,
        # or for the system to register the hotkey release properly.
        time.sleep(0.3)

        if method == 'typewrite':
            pyautogui.typewrite(text, interval=0.01) # Adjust interval for typing speed
        elif method == 'clipboard':
            pyperclip.copy(text)
            time.sleep(0.1) # Give clipboard time to update
            # Platform specific paste shortcuts
            if platform.system() == "Darwin": # macOS
                pyautogui.hotkey('command', 'v')
            else: # Windows/Linux
                pyautogui.hotkey('ctrl', 'v')
        else:
            print(f"Error: Unknown output method '{method}'")

    except Exception as e:
        print(f"Error during output: {e}")
        print("Ensure the target window has focus and necessary permissions are granted (especially for macOS/Wayland).")
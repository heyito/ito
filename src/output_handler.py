import platform
import time
import logging

import pyautogui
import pyperclip

logger = logging.getLogger(__name__)


def output_text(text: str, method: str = "typewrite"):
    """
    Outputs the given text using the specified method (typing or clipboard).
    """
    if not text:
        logger.warning("Output Handler: Received empty text.")
        return

    logger.info(f"Outputting text using method: {method}")
    try:
        # Add a small delay to allow user to switch focus if needed,
        # or for the system to register the hotkey release properly.
        time.sleep(0.3)

        if method == "typewrite":
            pyautogui.typewrite(text, interval=0.01)  # Adjust interval for typing speed
        elif method == "clipboard":
            pyperclip.copy(text)
            time.sleep(0.1)  # Give clipboard time to update
            # Platform specific paste shortcuts
            if platform.system() == "Darwin":  # macOS
                pyautogui.hotkey("command", "v")
            else:  # Windows/Linux
                pyautogui.hotkey("ctrl", "v")
        else:
            logger.error(f"Unknown output method '{method}'")

    except Exception as e:
        logger.error(f"Error during output: {e}")
        logger.warning(
            "Ensure the target window has focus and necessary permissions are granted (especially for macOS/Wayland)."
        )

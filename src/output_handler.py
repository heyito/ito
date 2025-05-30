import logging
import pyautogui

logger = logging.getLogger(__name__)


def output_text(text: str):
    """
    Outputs the given text using the specified method (typing or clipboard).
    """
    if not text:
        logger.warning("Output Handler: Received empty text.")
        return

    try:
        pyautogui.typewrite(text, interval=0.01)  # Adjust interval for typing speed

    except Exception as e:
        logger.error(f"Error during output: {e}")
        logger.warning(
            "Ensure the target window has focus and necessary permissions are granted (especially for macOS/Wayland)."
        )

# src/platform_utils_macos.py
import ctypes
import json
import logging
import os
import platform
import socket
import struct
import subprocess
import sys
import time
import uuid
from pathlib import Path

import objc
from Foundation import NSBundle, NSDictionary

# Configure logging
logger = logging.getLogger(__name__)


def is_macos():
    """Check if the current OS is macOS."""
    return platform.system() == "Darwin"


def run_applescript_one_line(script):
    """Executes an AppleScript string and returns the output or raises error.

    NOTE: Can only be a one-liner script.
    """
    if not is_macos():
        raise OSError("AppleScript can only be run on macOS.")
    try:
        # Using list form of subprocess.run() prevents shell injection
        # This is especially important if script content comes from user input
        process = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            check=True,
            timeout=10,
        )
        return process.stdout.strip()
    except subprocess.CalledProcessError as e:
        logger.error(f"AppleScript Error: {e}")
        logger.error(f"Stderr: {e.stderr}")
        raise RuntimeError(f"AppleScript execution failed: {e.stderr}") from e
    except subprocess.TimeoutExpired as e:
        raise TimeoutError("AppleScript command timed out.") from e
    except FileNotFoundError as e:
        raise FileNotFoundError(
            "osascript command not found. Is Xcode Command Line Tools installed?"
        ) from e
    except Exception as e:
        raise RuntimeError(
            f"An unexpected error occurred running AppleScript: {e}"
        ) from e


def run_applescript_file(relative_script_path, args=None):
    """
    Executes an AppleScript file located in src/apple_scripts and returns the output.

    Args:
        relative_script_path (str): Path to the AppleScript file relative to src/apple_scripts/
        args (list[str], optional): List of arguments to pass to the script. Defaults to None.

    Returns:
        str: Output from the AppleScript execution.

    Raises:
        FileNotFoundError: If the script file does not exist.
        RuntimeError: If the AppleScript execution fails.
        TimeoutError: If the script execution exceeds the timeout.
        OSError: If the platform is not macOS.
    """
    if not is_macos():
        raise OSError("AppleScript can only be run on macOS.")

    base_dir = Path(__file__).resolve().parent / "apple_scripts"
    script_path = base_dir / relative_script_path

    if not script_path.exists():
        raise FileNotFoundError(f"AppleScript not found at: {script_path}")

    command = ["osascript", str(script_path)]
    if args:
        command += [str(arg) for arg in args]

    try:
        result = subprocess.run(
            command, capture_output=True, text=True, check=True, timeout=10
        )
        logger.info(f"AppleScript output: {result}")
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        logger.error(f"AppleScript Error: {e.stderr.strip()}")
        raise RuntimeError(f"AppleScript execution failed:\n{e.stderr.strip()}") from e
    except subprocess.TimeoutExpired as e:
        raise TimeoutError("AppleScript execution timed out.") from e


def get_active_window_info():
    """Gets the name of the frontmost application on macOS."""
    if not is_macos():
        return None
    script = 'tell application "System Events" to get name of first application process whose frontmost is true'
    try:
        app_name = run_applescript_one_line(script)
        return {"app_name": app_name}
    except (RuntimeError, TimeoutError, FileNotFoundError) as e:
        logger.error(f"Could not get active window info: {e}")
        return None


def get_textedit_content():
    """Gets the text content of the frontmost TextEdit document."""
    if not is_macos():
        return None
    script = 'tell application "TextEdit" to get text of front document'
    try:
        return run_applescript_one_line(script)
    except (RuntimeError, TimeoutError, FileNotFoundError) as e:
        # Handle cases like TextEdit not running or no document open
        logger.error(f"Could not get TextEdit content: {e}")
        return None


def get_notes_content():
    """Gets the text content of the frontmost Notes document."""
    if not is_macos():
        return None
    try:
        return run_applescript_file("notes/get_active_note_body.applescript")
    except (RuntimeError, TimeoutError, FileNotFoundError) as e:
        logger.error(f"Could not get Notes content: {e}")
        return None


def set_notes_content(text_content):
    """Sets the text content of the frontmost Notes document."""
    if not is_macos():
        return False
    try:
        run_applescript_file("notes/set_active_note_body.applescript", [text_content])
        return True
    except (RuntimeError, TimeoutError, FileNotFoundError) as e:
        logger.error(f"Could not set Notes content: {e}")
        return False


def get_application_window_bounds(app_name):
    """Use AppleScript to get application window bounds (x, y, width, height)."""
    script = """
    tell application "System Events"
        tell process "{app_name}"
            set appPos to position of window 1
            set appSize to size of window 1
            return (item 1 of appPos) & "," & (item 2 of appPos) & "," & (item 1 of appSize) & "," & (item 2 of appSize)
        end tell
    end tell
    """
    result = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"AppleScript error: {result.stderr.strip()}")

    try:
        x, y, w, h = map(int, result.stdout.strip().split(","))
        return x, y, w, h
    except Exception as e:
        raise ValueError(
            f"Failed to parse AppleScript output: {result.stdout.strip()}"
        ) from e


def capture_application_window(app_name):
    """Capture screenshot of the application window."""
    x, y, w, h = get_application_window_bounds(app_name)
    region = f"{x},{y},{w},{h}"
    output_path = get_screenshot_path()
    subprocess.run(["screencapture", "-x", f"-R{region}", output_path], check=True)
    logger.info(f"Screenshot saved to: {output_path}")
    return output_path


def get_screenshot_path():
    cache_dir = Path.home() / "Library" / "Caches" / "com.yourcompany.yourapp"
    filename = f"notes_screenshot_{uuid.uuid4().hex}.png"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return str(cache_dir / filename)


def delete_if_exists(path):
    if os.path.exists(path):
        os.remove(path)


def set_textedit_content(text_content):
    """Sets the text content of the frontmost TextEdit document."""
    if not is_macos():
        return False
    # Escape backslashes and double quotes for AppleScript string literal
    escaped_text = text_content.replace("\\", "\\\\").replace('"', '\\"')
    script = (
        f'tell application "TextEdit" to set text of front document to "{escaped_text}"'
    )
    try:
        run_applescript_one_line(script)
        return True
    except (RuntimeError, TimeoutError, FileNotFoundError) as e:
        logger.error(f"Could not set TextEdit content: {e}")
        return False


def set_cursor_content(text_content):
    """Sets the text content of where the cursor is focused"""
    if not is_macos():
        return False


def get_browser_context(socket_path):
    logger.info("Getting content from Chrome...")
    try:
        sock = socket.socket(socket.AF_UNIX)
        sock.connect(socket_path)

        # Send request for context
        request = {"type": "request_context"}
        logger.info(f"Sending request: {request}")
        sock.send(json.dumps(request).encode())
        logger.info("Waiting for response...")

        # Keep reading responses until we get the context one
        start_time = time.time()
        timeout = 5  # 5 second timeout
        buffer = b""

        while time.time() - start_time < timeout:
            try:
                chunk = sock.recv(4096)
                if not chunk:
                    break

                buffer += chunk
                logger.debug(f"Received chunk, buffer size: {len(buffer)}")

                try:
                    # Try to parse the buffer as JSON
                    data = json.loads(buffer.decode())
                    logger.debug(
                        f"Successfully parsed JSON message type: {data.get('type')}"
                    )

                    # Only return if it's the context response we're waiting for
                    if data.get("type") == "context":
                        return data.get("data")
                    else:
                        logger.debug(
                            f"Ignoring non-context message of type: {data.get('type')}"
                        )
                        buffer = b""  # Clear buffer after successful parse
                        continue

                except json.JSONDecodeError:
                    # If we can't parse the buffer yet, it might be incomplete
                    # Continue reading more data
                    continue

            except UnicodeDecodeError as e:
                logger.error(f"Error decoding response bytes: {e}")
                logger.debug(f"Raw buffer: {buffer}")
                continue

        logger.warning("Timeout waiting for context response")
        return None

    except Exception as e:
        logger.error(f"Error getting Chrome context: {e}")
        return None
    finally:
        try:
            sock.close()
        except Exception:
            pass


def get_active_body(app_name):
    """Gets the active body of the given application."""
    if not is_macos():
        return None
    try:
        return run_applescript_file("get_active_body.applescript", [app_name])
    except (RuntimeError, TimeoutError, FileNotFoundError) as e:
        logger.error(f"Could not get active body: {e}")
        return None


def set_active_body(app_name, text_content):
    """Sets the active body of the given application."""
    if not is_macos():
        return False
    try:
        run_applescript_file("set_active_body.applescript", [app_name, text_content])
        return True
    except (RuntimeError, TimeoutError, FileNotFoundError) as e:
        logger.error(f"Could not set active body: {e}")
        return False


def send_native_message(message):
    """Sends a message to the Chrome extension and waits for a response."""
    try:
        # The native messaging host will be running and listening on stdin/stdout
        # We'll use a simple JSON format for communication
        message_json = json.dumps(message)
        message_bytes = message_json.encode("utf-8")

        # Write message length (4 bytes) followed by the message
        sys.stdout.buffer.write(struct.pack("@I", len(message_bytes)))
        sys.stdout.buffer.write(message_bytes)
        sys.stdout.buffer.flush()

        # Read response
        raw_length = sys.stdin.buffer.read(4)
        if not raw_length:
            return None
        response_length = struct.unpack("@I", raw_length)[0]
        response = sys.stdin.buffer.read(response_length).decode("utf-8")
        return json.loads(response)
    except Exception as e:
        logger.error(f"Error sending native message: {e}")
        return None


def check_accessibility_permission():
    """Check if the app has accessibility permissions and request them if needed."""
    try:
        logger = logging.getLogger("ai.ito.ito.accessibility")
        logger.info("Checking accessibility permissions...")

        bundle_id = NSBundle.mainBundle().bundleIdentifier()
        logger.info(f"Bundle ID: {bundle_id}")

        # Load the ApplicationServices framework
        app_services = ctypes.cdll.LoadLibrary(
            "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices"
        )

        # Set up the function signature
        app_services.AXIsProcessTrustedWithOptions.argtypes = [ctypes.c_void_p]
        app_services.AXIsProcessTrustedWithOptions.restype = ctypes.c_bool

        # Create the options dictionary
        options = NSDictionary.dictionaryWithObject_forKey_(
            True, "AXTrustedCheckOptionPrompt"
        )
        options_ptr = objc.pyobjc_id(options)

        # Call the function
        is_trusted = app_services.AXIsProcessTrustedWithOptions(options_ptr)
        logger.info(f"Accessibility trust status: {is_trusted}")

        if is_trusted:
            logger.info("Accessibility permissions granted")
            return True
        else:
            logger.warning("Accessibility permissions not granted")
            return False

    except Exception as e:
        logger = logging.getLogger("ai.ito.ito.accessibility")
        logger.error(f"Error checking/requesting accessibility permissions: {str(e)}")
        logger.error(f"Error type: {type(e).__name__}")
        import traceback

        logger.error(f"Traceback: {traceback.format_exc()}")
        return False


def check_accessibility_permission_no_prompt():
    """
    Check if the app has accessibility permissions WITHOUT prompting the system dialog.
    Returns True if permissions are granted, False otherwise.
    """
    if platform.system() != "Darwin":
        return True

    try:
        logger = logging.getLogger("ai.ito.ito.accessibility")
        logger.info("Checking accessibility permissions (silent)...")

        # Load the ApplicationServices framework
        app_services = ctypes.cdll.LoadLibrary(
            "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices"
        )

        # Method 1: Use AXIsProcessTrusted() - simplest, no dialog
        app_services.AXIsProcessTrusted.argtypes = []
        app_services.AXIsProcessTrusted.restype = ctypes.c_bool

        is_trusted = app_services.AXIsProcessTrusted()
        logger.info(f"Accessibility trust status (silent check): {is_trusted}")

        return is_trusted

    except Exception as e:
        logger = logging.getLogger("ai.ito.ito.accessibility")
        logger.error(f"Error checking accessibility permissions: {str(e)}")
        return False

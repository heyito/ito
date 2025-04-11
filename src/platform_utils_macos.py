# src/platform_utils_macos.py
import subprocess
import shlex
import platform
import json
import sys
import struct
import time
import socket

def is_macos():
    """Check if the current OS is macOS."""
    return platform.system() == "Darwin"

def run_applescript(script):
    """Executes an AppleScript string and returns the output or raises error."""
    if not is_macos():
        raise OSError("AppleScript can only be run on macOS.")
    try:
        # Using list form of subprocess.run() prevents shell injection
        # This is especially important if script content comes from user input
        process = subprocess.run(['osascript', '-e', script],
                                 capture_output=True, text=True, check=True, timeout=10)
        return process.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"AppleScript Error: {e}")
        print(f"Stderr: {e.stderr}")
        raise RuntimeError(f"AppleScript execution failed: {e.stderr}") from e
    except subprocess.TimeoutExpired:
        raise TimeoutError("AppleScript command timed out.")
    except FileNotFoundError:
        raise FileNotFoundError("osascript command not found. Is Xcode Command Line Tools installed?")
    except Exception as e:
        raise RuntimeError(f"An unexpected error occurred running AppleScript: {e}") from e


def get_active_window_info():
    """Gets the name of the frontmost application on macOS."""
    if not is_macos(): return None
    script = 'tell application "System Events" to get name of first application process whose frontmost is true'
    try:
        app_name = run_applescript(script)
        return {"app_name": app_name}
    except (RuntimeError, TimeoutError, FileNotFoundError) as e:
        print(f"Could not get active window info: {e}")
        return None

def get_textedit_content():
    """Gets the text content of the frontmost TextEdit document."""
    if not is_macos(): return None
    script = 'tell application "TextEdit" to get text of front document'
    try:
        return run_applescript(script)
    except (RuntimeError, TimeoutError, FileNotFoundError) as e:
        # Handle cases like TextEdit not running or no document open
        print(f"Could not get TextEdit content: {e}")
        return None

def set_textedit_content(text_content):
    """Sets the text content of the frontmost TextEdit document."""
    if not is_macos(): return False
    # Escape backslashes and double quotes for AppleScript string literal
    escaped_text = text_content.replace('\\', '\\\\').replace('"', '\\"')
    script = f'tell application "TextEdit" to set text of front document to "{escaped_text}"'
    try:
        run_applescript(script)
        return True
    except (RuntimeError, TimeoutError, FileNotFoundError) as e:
        print(f"Could not set TextEdit content: {e}")
        return False

def get_chrome_context():
    print("Getting content from Chrome...")
    try:
        sock = socket.socket(socket.AF_UNIX)
        sock.connect("/tmp/Inten_native_host.sock")
        
        # Send request for context
        sock.send(json.dumps({"type": "request_context"}).encode())
        print("Waiting for response...")
        
        # Keep reading responses until we get the context one
        start_time = time.time()
        timeout = 5  # 5 second timeout
        
        while time.time() - start_time < timeout:
            try:
                response = sock.recv(4096)
                if not response:
                    break
                    
                data = json.loads(response.decode())
                print(f"Received message type: {data.get('type')}")
                
                # Only return if it's the context response we're waiting for
                if data.get('type') == 'context':
                    return data.get('data')
                else:
                    print(f"Ignoring non-context message of type: {data.get('type')}")
                    continue
                    
            except json.JSONDecodeError as e:
                print(f"Error decoding response: {e}")
                continue
                
        print("Timeout waiting for context response")
        return None
        
    except Exception as e:
        print(f"Error getting Chrome context: {e}")
        return None
    finally:
        try:
            sock.close()
        except:
            pass

def send_native_message(message):
    """Sends a message to the Chrome extension and waits for a response."""
    try:
        # The native messaging host will be running and listening on stdin/stdout
        # We'll use a simple JSON format for communication
        message_json = json.dumps(message)
        message_bytes = message_json.encode('utf-8')
        
        # Write message length (4 bytes) followed by the message
        sys.stdout.buffer.write(struct.pack('@I', len(message_bytes)))
        sys.stdout.buffer.write(message_bytes)
        sys.stdout.buffer.flush()
        
        # Read response
        raw_length = sys.stdin.buffer.read(4)
        if not raw_length:
            return None
        response_length = struct.unpack('@I', raw_length)[0]
        response = sys.stdin.buffer.read(response_length).decode('utf-8')
        return json.loads(response)
    except Exception as e:
        print(f"Error sending native message: {e}")
        return None
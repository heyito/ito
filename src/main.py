import sys
import os
import configparser
import threading
import queue
import time
import numpy as np
import platform
import socket
import json
import logging
from pynput import keyboard
import traceback    
# from settings_ui import SettingsWindow
# from PyQt6.QtWidgets import QApplication

# Import platform utils conditionally
if platform.system() == "Darwin":
    try:
        import platform_utils_macos as platform_utils
        print("macOS detected. Loading macOS platform utilities.")
    except ImportError:
        print("WARNING: Running on macOS but failed to import 'platform_utils_macos'. OS interaction will fail.")
        # Define dummy class to avoid errors later if import failed
        class PlatformUtilsDummy:
            def is_macos(self): return True # Pretend it is for checks
            def get_active_window_info(self): print("Error: platform_utils_macos import failed."); return None
            def get_textedit_content(self): print("Error: platform_utils_macos import failed."); return None
            def set_textedit_content(self, text): print("Error: platform_utils_macos import failed."); return False
        platform_utils = PlatformUtilsDummy()

else:
    # Define dummy functions or raise error if not macOS
    print(f"Running on {platform.system()}. OS-specific interactions limited.")
    class PlatformUtilsDummy:
        def is_macos(self): return False
        def get_active_window_info(self): print("Warning: OS interaction not supported on this platform."); return None
        def get_textedit_content(self): print("Warning: TextEdit interaction not supported."); return None
        def set_textedit_content(self, text): print("Warning: TextEdit interaction not supported."); return False
    platform_utils = PlatformUtilsDummy()

# Import core application modules
import audio_handler, asr_handler, llm_handler, prompt_templates # Keep output_handler for potential fallback/typing?

# --- Global State ---
is_recording = False
is_processing = False # Flag to prevent overlapping processing
stop_recording_event = threading.Event()
audio_queue = queue.Queue()
action_queue = queue.Queue() # Queue for commands from hotkey
processing_lock = threading.Lock() # To ensure only one processing pipeline runs
current_context = {"app_name": None, "doc_text": None} # Store context for current operation

# --- Load Configuration ---
config = configparser.ConfigParser()

SOCKET_PATH = "/tmp/inten_native_host.sock"

def get_resource_path(relative_path):
    """Get absolute path to resource, works for dev and for PyInstaller"""
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")

    return os.path.join(base_path, relative_path)

try:
    config.read(get_resource_path('config.ini'))
    if not config.sections():
        raise FileNotFoundError(f"config.ini not found or empty at {get_resource_path('config.ini')}")

    # OpenAI Config
    openai_api_key = config['OpenAI']['api_key']
    if 'YOUR_OPENAI_API_KEY_HERE' in openai_api_key or not openai_api_key:
         print("WARNING: OpenAI API key not set in config.ini. OpenAI features will fail.")
         # No exit() here, maybe user uses local models only

    # ASR Config
    asr_provider = config['ASR']['provider']
    asr_model = config['ASR']['model']

    # LLM Config
    llm_provider = config['LLM']['provider']
    llm_model = config['LLM']['local_model'] if llm_provider == 'local_llm' else config['LLM']['model']
    print(f"LLM Provider: {llm_provider}")
    print(f"LLM Model: {llm_model}")
    llm_system_prompt = prompt_templates.SYSTEM_PROMPT

    # Preload local model if using local_llm provider
    if llm_provider == "local_llm":
        print("Preloading local model...")
        llm_handler.preload_local_model(
            model_name=llm_model,
            quantization=config['LLM'].getint('quantization', 4)
        )

    # Audio Config
    sample_rate = config['Audio'].getint('sample_rate', 16000)
    channels = config['Audio'].getint('channels', 1)
    device_index_str = config['Audio'].get('device_index', None)
    device_index = int(device_index_str) if device_index_str and device_index_str.isdigit() else None

    # VAD Config
    vad_config = {
        'enabled': config['VAD'].getboolean('enabled', False),
        'aggressiveness': config['VAD'].getint('aggressiveness', 1),
        'silence_duration_ms': config['VAD'].getint('silence_duration_ms', 1500),
        'frame_duration_ms': config['VAD'].getint('frame_duration_ms', 30),
    }

    # Output Config (Kept for potential fallback, not primary path now)
    output_method = config['Output']['method']

    # Hotkey Config
    start_hotkey_str = config['Hotkeys']['start_recording_hotkey'] # Hotkey now starts context check + command recording

except (KeyError, FileNotFoundError, ValueError) as e:
    print(f"Error loading configuration from config.ini: {e}")
    print("Please ensure config.ini exists, is correctly formatted, and contains all required keys.")
    sys.exit(1)  # Use sys.exit instead of exit
except Exception as e:
    print(f"An unexpected error occurred during configuration loading: {e}")
    sys.exit(1)  # Use sys.exit instead of exit


# --- Core Logic ---

def processing_thread_func(original_doc_text: str, user_command: str, sr: int, ch: int):
    """
    Processes the transcribed user command against the provided document context.
    Sends combined info to LLM and updates the target application (TextEdit).
    """
    global is_processing
    # This function now runs under the processing_lock acquired by its caller (vad_monitor)
    # No need to acquire lock here again.

    print("--- Starting Processing Pipeline (Document Command) ---")
    if not user_command:
        print("Error: No user command provided for processing.")
        is_processing = False # Release state
        return
    if original_doc_text is None: # Check for None, empty string "" is valid
         print("Error: Invalid document context (None) provided for processing.")
         is_processing = False # Release state
         return

    try:
        print(f"Processing command: '{user_command}'")
        print(f"On document context (length: {len(original_doc_text)} chars)")

        # 1. Construct LLM Prompt
        print("Constructing LLM prompt with distinct markers...")
        
        # Parse the original_doc_text as JSON if it's from Chrome
        if current_context.get("app_name") == "Google Chrome":
            try:
                chrome_context = json.loads(original_doc_text)
                print(f"Chrome context: {chrome_context}")
                
                # Get the active element content
                content = prompt_templates.get_active_element_content(chrome_context)
                
                # Create the prompt using the template
                full_llm_input = prompt_templates.create_chrome_prompt(
                    url=chrome_context.get('url', ''),
                    title=chrome_context.get('title', ''),
                    content=content,
                    command=user_command,
                    selected_text=chrome_context.get('selectedText')
                )
            except json.JSONDecodeError:
                # Fallback if the text isn't valid JSON
                full_llm_input = f"""[START CURRENT DOCUMENT CONTENT]
{original_doc_text}
[END CURRENT DOCUMENT CONTENT]

[USER COMMAND]
{user_command}
"""
        else:
            # For TextEdit or other applications
            full_llm_input = prompt_templates.create_textedit_prompt(
                content=original_doc_text,
                command=user_command
            )

        # 2. Process with LLM
        print(f"Sending context and command to LLM ({llm_provider}, {llm_model})...")
        print(f"System prompt: {llm_system_prompt}")
        print(f"Full LLM input:\n---\n{full_llm_input}\n---")
        print("Sending to LLM...")
        new_doc_text = llm_handler.process_text_with_llm(
            text=full_llm_input, # Pass combined context+command as user message content
            system_prompt_override=llm_system_prompt, # Pass the system prompt from config
            provider=llm_provider,
            api_key=openai_api_key,
            model=llm_model,
            quantization=config['LLM'].getint('quantization', 4),
            # Note: llm_handler needs modification if it doesn't support system_prompt_override
            # Or adjust here to send a single combined prompt string if handler only takes 'text'
        )

        if new_doc_text is None: # Check for None specifically
            print("LLM processing failed or did not return content.")
            # is_processing is released in finally block
            return # Exit processing early

        print(f"LLM returned new document content (length: {len(new_doc_text)} chars).")
        # Optional: Add more verbose logging for debugging
        print(f"LLM Output Snippet:\n---\n{new_doc_text[:200]}...\n---")

        # 3. Replace content in Target Application (TextEdit specific for now)
        if platform_utils.is_macos() and current_context.get("app_name") == "TextEdit":
            print("Attempting to replace content in TextEdit via AppleScript...")
            success = platform_utils.set_textedit_content(new_doc_text)

            if success:
                print("Successfully updated TextEdit document.")
            else:
                print("Failed to update TextEdit document via AppleScript.")
        elif current_context.get("app_name") == "Google Chrome":
            print("Sending text update to Chrome extension...")
            try:
                # Connect to the native messaging host socket
                client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                client.connect(SOCKET_PATH)
                
                # Send the message to update text
                message = {
                    "type": "insert_text",
                    "text": new_doc_text
                }
                client.send(json.dumps(message).encode())
                client.close()
                print("Successfully sent text update to Chrome extension")
            except Exception as e:
                print(f"Error sending text update to Chrome extension: {e}")
        else:
            print("Skipping document update (Not on macOS or not TextEdit/Chrome).")


    except Exception as e:
        print(f"Error during processing pipeline: {e}")
        import traceback
        traceback.print_exc()
    finally:
        is_processing = False # Release processing state
        print("--- Processing Pipeline Finished ---")


def vad_monitor_and_process_thread_func(stop_event, audio_q, original_doc_text, sr, ch):
    """
    Waits for VAD stop, collects command audio, transcribes,
    then checks if processing is busy and starts the processing thread if not.
    """
    global is_recording, is_processing # Need access to global state

    stop_event.wait() # Blocks here until event is set
    # --- Recording has stopped (update state AFTER wait) ---
    if is_recording: # Check if it was actually us stopping recording state
        is_recording = False

    print("Stop event detected by monitor thread. Collecting command audio...")

    # Retrieve all data from the queue
    collected_audio_chunks = []
    while not audio_q.empty():
        try:
            collected_audio_chunks.append(audio_q.get_nowait())
        except queue.Empty:
            break

    if not collected_audio_chunks:
         print("No command audio collected after recording stopped.")
         return # Nothing to process

    # --- Transcribe the collected audio (which represents the user's command) ---
    # ... (Keep transcription logic exactly as before) ...
    try:
        command_audio_data = np.concatenate(collected_audio_chunks, axis=0)
        command_audio_buffer = audio_handler.save_wav_to_buffer(command_audio_data, sr, ch)
    except ValueError as e:
         print(f"Error processing collected audio chunks: {e}")
         return
    if not command_audio_buffer:
        print("Failed to create command audio buffer.")
        return

    print("Transcribing user command...")
    user_command = asr_handler.transcribe_audio(
        # ... (pass all arguments as before) ...
        audio_buffer=command_audio_buffer,
        provider=asr_provider,
        api_key=openai_api_key,
        model=asr_model,
        local_model_size=config['ASR'].get('local_model_size', 'base.en'),
        device=config['ASR'].get('device', 'auto'),
        compute_type=config['ASR'].get('compute_type', 'default')
    )

    if not user_command:
        print("Command transcription failed or returned empty.")
        return
    # --- Command Transcription Complete ---

    # Check if already processing BEFORE starting the thread
    if is_processing:
        print("Processing is already ongoing. Skipping this command.")
        return
    else:
        # Start processing thread IF NOT already processing
        # The processing thread itself will handle the lock internally
        print(f"Starting processing thread for command: '{user_command}'")
        processing_thread = threading.Thread(
            target=processing_thread_func,
            args=(original_doc_text, user_command, sr, ch), # Pass context & command
            daemon=True
        )
        # Note: is_processing flag is set inside processing_thread_func now
        processing_thread.start()


def on_keyboard_press(key):
    start_hotkey = keyboard.Key.f9
    try:
        start_hotkey = getattr(keyboard.Key, start_hotkey_str)
    except AttributeError:
        start_hotkey = keyboard.KeyCode.from_char(start_hotkey_str)
    
    if key == start_hotkey:
        trigger_start_recording(key)

# --- Hotkey Callback (Simple trigger putting command in queue) ---
def trigger_start_recording(key):
    """
    Called by the keyboard library upon hotkey press.
    Puts a command ('START_RECORDING') into the action_queue
    for the main loop to process, preventing complex logic
    within the sensitive keyboard hook context.
    Includes checks to avoid queuing multiple starts if busy.
    """
    # Check status flags BEFORE queueing to avoid flooding queue if busy
    if is_processing:
         print(f"[{time.strftime('%H:%M:%S')}] Hotkey '{start_hotkey_str}' detected, but PROCESSING is busy.")
         # Consider adding user feedback like a beep sound here
         return
    if is_recording:
         print(f"[{time.strftime('%H:%M:%S')}] Hotkey '{start_hotkey_str}' detected, but already RECORDING.")
         # Consider adding user feedback
         return

    print(f"[{time.strftime('%H:%M:%S')}] Hotkey '{start_hotkey_str}' detected. Queuing context check & start command.")
    action_queue.put("START_RECORDING") # Signal main loop


# --- Function to handle context check and start recording (called from main loop) ---
recording_thread_handle = None
monitor_thread_handle = None

def _initiate_recording_process():
    """
    Checks the application context (active window, gets content if TextEdit).
    If context is valid, starts the audio recording thread (for the command)
    and the VAD monitor thread.
    """
    global is_recording, stop_recording_event, audio_queue, current_context
    global recording_thread_handle, monitor_thread_handle

    # Double-check status flags at the moment of execution from queue
    if is_recording or is_processing:
        print(f"Info: Start action received, but state changed. Currently recording={is_recording}, processing={is_processing}. Aborting start.")
        return

    # 1. Check active window context (Platform specific)
    print("Checking active window context...")
    active_window = platform_utils.get_active_window_info()
    if not active_window:
        print("Error: Could not determine active window.")
        return # Do not proceed

    current_context['app_name'] = active_window.get("app_name", "Unknown")
    print(f"Active application: {current_context['app_name']}")

    # --- Target specific application logic (TextEdit on macOS) ---
    original_doc_text_for_command = None # Variable to hold context for this operation
    if platform_utils.is_macos():
        if current_context['app_name'] == "TextEdit":
            print("Getting content from TextEdit...")
            original_doc_text_for_command = platform_utils.get_textedit_content()
            if original_doc_text_for_command is None:
                print("Error: Failed to get text from TextEdit (is a document open and frontmost?). Aborting.")
                return # Do not proceed without context
            print(f"Obtained TextEdit content (length: {len(original_doc_text_for_command)} chars).")
        elif current_context['app_name'] == "Google Chrome":
            print("Getting content from Chrome...")
            # Request context from Chrome extension with timeout
            try:
                import signal
                from functools import wraps
                import errno

                def timeout_handler(signum, frame):
                    raise TimeoutError("Getting Chrome context timed out")

                # Set the signal handler and a 5-second timeout
                signal.signal(signal.SIGALRM, timeout_handler)
                signal.alarm(5)  # 5 seconds

                try:
                    chrome_context = platform_utils.get_chrome_context(SOCKET_PATH)
                    print(f"Received Chrome context: {chrome_context}")
                    signal.alarm(0)  # Disable the alarm
                    
                    if chrome_context is None:
                        print("Error: Failed to get context from Chrome. Aborting.")
                        return
                    
                    # Print the chrome context
                    print(f"Chrome context: {chrome_context}")
                    # Combine relevant context from Chrome
                    original_doc_text_for_command = ""
                    
                    # Application context
                    original_doc_text_for_command += "[APPLICATION]\nGoogle Chrome\n\n"
                    
                    # Page context
                    if chrome_context.get('url') or chrome_context.get('title'):
                        original_doc_text_for_command += "[PAGE]\n"
                        if chrome_context.get('url'):
                            original_doc_text_for_command += f"{chrome_context['url']}\n"
                        if chrome_context.get('title'):
                            original_doc_text_for_command += f"{chrome_context['title']}\n"
                        original_doc_text_for_command += "\n"
                    
                    # Content context
                    original_doc_text_for_command += "[START CURRENT DOCUMENT CONTENT]\n"
                    
                    # Handle contenteditable elements
                    if chrome_context.get('activeElement', {}).get('isContentEditable'):
                        if chrome_context.get('activeElementValue'):
                            original_doc_text_for_command += f"{chrome_context['activeElementValue']}\n"
                    
                    # Handle regular input/textarea elements
                    elif chrome_context.get('activeElement', {}).get('isTextInput'):
                        if chrome_context.get('activeElement', {}).get('value'):
                            original_doc_text_for_command += f"{chrome_context['activeElement']['value']}\n"
                    
                    # Add selected text if any
                    if chrome_context.get('selectedText'):
                        original_doc_text_for_command += f"\nSelected text: {chrome_context['selectedText']}\n"
                    
                    original_doc_text_for_command += "\n[END CURRENT DOCUMENT CONTENT]\n"
                    
                    print(f"Obtained Chrome context (length: {len(original_doc_text_for_command)} chars).")
                    
                except TimeoutError:
                    print("Error: Timed out while getting Chrome context. Aborting.")
                    return
                finally:
                    signal.alarm(0)  # Ensure the alarm is disabled
                    
            except Exception as e:
                print(f"Error while getting Chrome context: {e}")
                return
        else:
            print(f"Info: Active application ({current_context['app_name']}) is not supported. Currently supported: TextEdit and Google Chrome.")
            return
    else:
        print("Info: Not running on macOS, cannot get application context.")
        return

    # 3. If context is valid, start recording for the user's command
    is_recording = True # Set state flag
    stop_recording_event.clear()
    audio_queue = queue.Queue() # Reset queue

    print(f"[{time.strftime('%H:%M:%S')}] Context OK. Starting command recording (VAD: {vad_config['enabled']}, stops after {vad_config['silence_duration_ms']}ms silence)... Speak your command now.")

    # Start the audio recording thread (using the VAD function)
    recording_thread_handle = threading.Thread(
        target=audio_handler.record_audio_stream_with_vad,
        args=(stop_recording_event, audio_queue, device_index, sample_rate, channels, vad_config),
        daemon=True # Allows app to exit even if this thread hangs (though cleanup is better)
    )
    recording_thread_handle.start()

    # Start the VAD monitor thread, passing the captured document text
    monitor_thread_handle = threading.Thread(
        target=vad_monitor_and_process_thread_func,
        args=(stop_recording_event, audio_queue, original_doc_text_for_command, sample_rate, channels), # Pass doc text
        daemon=True
    )
    monitor_thread_handle.start()

# def show_settings():
#     app = QApplication(sys.argv)
#     window = SettingsWindow()
#     window.show()
#     app.exec()

def run_native_messaging_host():
    """Run the native messaging host functionality"""
    from native_messaging_host import main as native_messaging_main
    native_messaging_main()

def ensure_native_messaging_host_registered():
    """Ensure the native messaging host manifest is registered with Chrome"""
    try:
        # Only need manifest directory now
        manifest_dir = os.path.expanduser("~/Library/Application Support/Google/Chrome/NativeMessagingHosts")
        
        # Create manifest directory
        os.makedirs(manifest_dir, exist_ok=True)
        
        # Create and write manifest file
        manifest = {
            "name": "ai.inten.app",
            "description": "Inten native messaging host",
            "path": "/Applications/Inten.app/Contents/Resources/native_messaging_host.sh",
            "type": "stdio",
            "allowed_origins": [
                "chrome-extension://jgfjmabgdpbccfecnilbjnjoglnholem/"
            ]
        }

        manifest_path = os.path.join(manifest_dir, "ai.inten.app.json")
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)
            
        # Set manifest permissions
        os.chmod(manifest_path, 0o644)
            
        logging.info("Native messaging host manifest registered successfully")
        
    except Exception as e:
        logging.error(f"Failed to register native messaging host manifest: {e}")

# --- Main Execution Block ---
if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--native-messaging-host":
        print("Starting native messaging host...")
        run_native_messaging_host()
    else:
        # Register native messaging host first
        ensure_native_messaging_host_registered()
        
        print("\n--- Inten Tool (Document Command Mode) ---")
        print(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}") # Add timestamp
        if not platform_utils.is_macos():
             print("WARNING: Running on non-macOS. TextEdit interaction will be disabled.")

        # Print key config details
        print(f"ASR Provider: {asr_provider} ({asr_model if asr_provider == 'openai_api' else config['ASR'].get('local_model_size','N/A')})")
        print(f"LLM Provider: {llm_provider} ({llm_model})")
        print(f"VAD Enabled: {vad_config['enabled']}")
        if vad_config['enabled']:
            print(f"Stops after {vad_config['silence_duration_ms']}ms of silence (Aggressiveness: {vad_config['aggressiveness']}).")

        print(f"\nTarget Application (Initial): TextEdit on macOS")
        print(f"Press '{start_hotkey_str}' when TextEdit is active to issue a command.")
        print("Ensure required Accessibility/Automation permissions are granted (macOS).")
        print("Press Ctrl+C in the console to quit.")

        # --- Setup Hotkey Listener ---
        # Use the simple trigger function as the callback
        try:
            # Attempt to remove previous hook in case of reload (helps sometimes)
            # try: keyboard.remove_hotkey(start_hotkey) TOD
            # except KeyError: pass
            # Register the new hotkey
            listener = keyboard.Listener(on_press=on_keyboard_press)
            listener.start()
            print(f"Hotkey '{start_hotkey_str}' registered successfully.")
        except Exception as e:
            print(f"\nERROR setting hotkey '{start_hotkey_str}': {e}")
            print("This might be due to permissions issues (especially on macOS or Wayland).")
            print("Try checking System Settings > Privacy & Security > Accessibility / Input Monitoring.")
            print("Alternatively, try running the script with sudo (Linux/macOS) or as Administrator (Windows) - use with caution.")
            exit()

        # --- Main Loop (Processing Action Queue) ---
        try:
            while True:
                try:
                    # Check the action queue for commands from the hotkey callback
                    action = action_queue.get(block=True, timeout=0.1) # Wait briefly for action

                    if action == "START_RECORDING":
                        # Call the function that contains the context check & recording logic
                        _initiate_recording_process()
                    else:
                        print(f"Warning: Unknown action received in queue: {action}")

                except queue.Empty:
                    # No action requested in this interval, loop continues
                    pass

                # Optional: A very small sleep prevents the loop from spinning uselessly
                # when the queue is empty, reducing CPU usage slightly.
                # time.sleep(0.01) # Disabled for now, timeout on queue.get serves similar role

        except KeyboardInterrupt:
            print("\nCtrl+C detected. Initiating shutdown...")
        except Exception as e:
            print(f"\nAn unexpected error occurred in the main loop: {e}")
            import traceback
            traceback.print_exc()
        finally:
            # --- Cleanup ---
            print("Cleaning up resources...")
            if is_recording:
                print("Signaling active recording thread to stop...")
                stop_recording_event.set() # Ensure recording/monitor threads exit if active

            # Unregister hotkey
            # try:
            #     print(f"Removing hotkey '{start_hotkey_str}'...")
            #     keyboard.remove_hotkey(start_hotkey_str)
            # except (KeyError, NameError): # NameError if start_hotkey failed loading
            #      print("Hotkey was not registered or already removed.")
            # except Exception as e:
            #      print(f"Error removing hotkey: {e}")


            # Optional: Wait briefly for threads to potentially finish cleanup, though daemon=True helps
            # time.sleep(0.5)

            print("Exited.")

    # Stop the hotkey listener
    listener.stop()
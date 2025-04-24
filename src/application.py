import queue
import threading
import time
import numpy as np
from pynput import keyboard
from typing import Optional

from src import prompt_templates
from src.engines.processing_engine import ProcessingEngine
from src.engines.context_engine import ContextEngine
from src.constants import SOCKET_PATH
from src import platform_utils_macos as platform_utils
from src.handlers.asr_handler import ASRHandler
from src.handlers.audio_handler import AudioHandler
from src.handlers.llm_handler import LLMHandler

class Application:
    def __init__(self, context_engine: ContextEngine, processing_engine: ProcessingEngine,
                 asr_handler: ASRHandler, llm_handler: LLMHandler, audio_handler: AudioHandler,
                 config: dict):
        self.context_engine = context_engine
        self.processing_engine = processing_engine
        self.asr_handler = asr_handler
        self.llm_handler = llm_handler
        self.audio_handler = audio_handler
        self.config_dict = config # Store the config dictionary

        # Application State
        self.is_recording = False
        self.is_processing = False
        self.stop_recording_event = threading.Event()
        self.audio_queue = queue.Queue()
        self.action_queue = queue.Queue()
        self.processing_lock = threading.Lock()
        self.current_context_data = {"app_name": None, "doc_text": None}
        self.recording_thread_handle = None
        self.monitor_thread_handle = None
        self.hotkey_listener = None # Initialize listener attribute

        # Get config values from the dictionary using .get() for safety
        vad_section = self.config_dict.get('VAD', {}) # Get VAD section or empty dict
        hotkey_section = self.config_dict.get('Hotkeys', {})

        self.vad_config = { # Build vad_config dict from individual gets
            'enabled': vad_section.get('enabled', 'false').lower() == 'true',
            'aggressiveness': int(vad_section.get('aggressiveness', 1)),
            'silence_duration_ms': int(vad_section.get('silence_duration_ms', 1500)),
            'frame_duration_ms': int(vad_section.get('frame_duration_ms', 30)),
        }
        self.start_hotkey_str = hotkey_section.get('start_recording_hotkey', 'f9')

        asr_section = self.config_dict.get('ASR')
        self.asr_provider = asr_section.get('provider', 'openai_api')
        self.asr_model = asr_section.get('model', 'whisper-1')
        self.asr_local_model_size = asr_section.get('local_model_size', 'base.en')
        self.asr_device = asr_section.get('device', 'auto')
        self.asr_compute_type = asr_section.get('compute_type', 'default')

        llm_section = self.config_dict.get('LLM')
        self.llm_provider = llm_section.get('provider', 'openai_api')
        self.llm_model = llm_section.get('model', 'gpt-4o')
        self.llm_local_quantization = llm_section.get('local_quantization', 4)

    def run(self):
        self._setup_hotkey_listener()

        print("\n--- Inten Tool (Document Command Mode) ---")
        print(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}") # Add timestamp
        if not platform_utils.is_macos():
             print("WARNING: Running on non-macOS. TextEdit interaction will be disabled.")

        # Print key config details
        print(f"ASR Provider: {self.asr_provider} ({self.asr_model if self.asr_provider == 'openai_api' else self.asr_local_model_size})")
        print(f"LLM Provider: {self.llm_provider} ({self.llm_model})")
        print(f"VAD Enabled: {self.vad_config['enabled']}")
        if self.vad_config['enabled']:
            print(f"Stops after {self.vad_config['silence_duration_ms']}ms of silence (Aggressiveness: {self.vad_config['aggressiveness']}).")

        print(f"\nTarget Application (Initial): TextEdit on macOS")
        print(f"Press '{self.start_hotkey_str}' when TextEdit is active to issue a command.")
        print("Ensure required Accessibility/Automation permissions are granted (macOS).")
        print("Press Ctrl+C in the console to quit.")


        self._run_event_loop() # Contains the while True loop
        self._cleanup()
        print("Inten shut down.")

    def _setup_hotkey_listener(self):
        # Use self.start_hotkey_str and self._on_hotkey_press callback
        print(f"Setting up hotkey: {self.start_hotkey_str}")
        try:
            listener = keyboard.Listener(on_press=self._on_keyboard_press)
            listener.start()
            self.hotkey_listener = listener # Store for cleanup
            print(f"Hotkey '{self.start_hotkey_str}' registered successfully.")
        except Exception as e:
            print(f"\nERROR setting hotkey '{self.start_hotkey_str}': {e}")
            print("This might be due to permissions issues (especially on macOS or Wayland).")
            print("Try checking System Settings > Privacy & Security > Accessibility / Input Monitoring.")
            print("Alternatively, try running the script with sudo (Linux/macOS) or as Administrator (Windows) - use with caution.")
            # Handle error gracefully, maybe raise exception to stop app
            raise RuntimeError("Failed to set hotkey") from e

    def _on_keyboard_press(self, key):
        # Convert string to key object
        hotkey_obj = None
        try:
            hotkey_obj = getattr(keyboard.Key, self.start_hotkey_str)
        except AttributeError:
            try:
                 hotkey_obj = keyboard.KeyCode.from_char(self.start_hotkey_str)
            except ValueError:
                 print(f"ERROR: Invalid hotkey string: {self.start_hotkey_str}")
                 return # Or handle error

        if key == hotkey_obj:
            self._trigger_start_recording(key)

    def _trigger_start_recording(self, key):
        """
        Called by the keyboard library upon hotkey press.
        Puts a command ('START_RECORDING') into the action_queue
        for the main loop to process, preventing complex logic
        within the sensitive keyboard hook context.
        Includes checks to avoid queuing multiple starts if busy.
        """
        # Check status flags BEFORE queueing to avoid flooding queue if busy
        if self.is_processing:
            print(f"[{time.strftime('%H:%M:%S')}] Hotkey '{key}' detected, but PROCESSING is busy.")
            # Consider adding user feedback like a beep sound here
            return
        if self.is_recording:
            print(f"[{time.strftime('%H:%M:%S')}] Hotkey '{key}' detected, but already RECORDING.")
            # Consider adding user feedback
            return

        print(f"[{time.strftime('%H:%M:%S')}] Hotkey '{key}' detected. Queuing context check & start command.")
        self.action_queue.put("START_RECORDING") # Signal main loop

    def _run_event_loop(self):
        try:
            while True:
                try:
                    # Check the action queue for commands from the hotkey callback
                    action = self.action_queue.get(block=True, timeout=0.1) # Wait briefly for action

                    if action == "START_RECORDING":
                        # Call the function that contains the context check & recording logic
                        self._initiate_recording_process()
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
            if self.is_recording:
                print("Signaling active recording thread to stop...")
                self.stop_recording_event.set() # Ensure recording/monitor threads exit if active

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

    def _initiate_recording_process(self):
        """
        Checks the application context (active window, gets content if TextEdit).
        If context is valid, starts the audio recording thread (for the command)
        and the VAD monitor thread.
        """
        # Double-check status flags at the moment of execution from queue
        if self.is_recording or self.is_processing:
            print(f"Info: Start action received, but state changed. Currently recording={self.is_recording}, processing={self.is_processing}. Aborting start.")
            return

        # 1. Check active window context (Platform specific)
        print("Checking active window context...")
        active_window = platform_utils.get_active_window_info()
        if not active_window:
            print("Error: Could not determine active window.")
            return # Do not proceed

        self.current_context_data['app_name'] = active_window.get("app_name", "Unknown")
        print(f"Active application: {self.current_context_data['app_name']}")

        original_doc_text_for_command = None # Variable to hold context for this operation
        context_engine = self.context_engine
        original_doc_text_for_command = context_engine.get_context(self.current_context_data)
        # 3. If context is valid, start recording for the user's command
        self.is_recording = True # Set state flag
        self.stop_recording_event.clear()
        self.audio_queue = queue.Queue() # Reset queue

        print(f"[{time.strftime('%H:%M:%S')}] Context OK. Starting command recording (VAD: {self.vad_config['enabled']}, stops after {self.vad_config['silence_duration_ms']}ms silence)... Speak your command now.")

        # Start the audio recording thread (using the VAD function)
        self.recording_thread_handle = threading.Thread(
            target=self.audio_handler.record_audio_stream_with_vad,
            args=(self.stop_recording_event, self.audio_queue, self.vad_config),
            daemon=True
        )
        self.recording_thread_handle.start()

        # Start the VAD monitor thread, passing the captured document text
        self.monitor_thread_handle = threading.Thread(
            target=self._vad_monitor_and_process_thread_target,
            args=(original_doc_text_for_command,),
            daemon=True
        )
        self.monitor_thread_handle.start()

    def _processing_thread_target(self, original_doc_text, user_command):
        print("--- Starting Processing Pipeline (Document Command) ---")
        if not user_command:
            print("Error: No user command provided for processing.")
            self.is_processing = False # Release state
            return
        if original_doc_text is None: # Check for None, empty string "" is valid
            print("Error: Invalid document context (None) provided for processing.")
            self.is_processing = False # Release state
            return

        try:
            self.processing_engine.process(self.current_context_data, original_doc_text, user_command)
        except Exception as e:
            print(f"Error during processing pipeline: {e}")
            import traceback
            traceback.print_exc()
        finally:
            self.is_processing = False # Release processing state
            print("--- Processing Pipeline Finished ---")
    
    def _vad_monitor_and_process_thread_target(self, original_doc_text):
        """
        Waits for VAD stop, collects command audio, transcribes,
        then checks if processing is busy and starts the processing thread if not.
        """

        self.stop_recording_event.wait() # Blocks here until event is set
        # --- Recording has stopped (update state AFTER wait) ---
        if self.is_recording: # Check if it was actually us stopping recording state
            self.is_recording = False

        print("Stop event detected by monitor thread. Collecting command audio...")

        # Retrieve all data from the queue
        collected_audio_chunks = []
        while not self.audio_queue.empty():
            try:
                collected_audio_chunks.append(self.audio_queue.get_nowait())
            except queue.Empty:
                break

        if not collected_audio_chunks:
            print("No command audio collected after recording stopped.")
            return # Nothing to process

        # --- Transcribe the collected audio (which represents the user's command) ---
        try:
            command_audio_data = np.concatenate(collected_audio_chunks, axis=0)
            command_audio_buffer = self.audio_handler.save_wav_to_buffer(command_audio_data, self.audio_handler.sample_rate, self.audio_handler.channels)
        except ValueError as e:
            print(f"Error processing collected audio chunks: {e}")
            return
        if not command_audio_buffer:
            print("Failed to create command audio buffer.")
            return

        print("Transcribing user command...")
        user_command = self.asr_handler.transcribe_audio(
            audio_buffer=command_audio_buffer,
        )


        if not user_command:
            print("Command transcription failed or returned empty.")
            return
        # --- Command Transcription Complete ---

        # Check if already processing BEFORE starting the thread
        if self.is_processing:
            print("Processing is already ongoing. Skipping this command.")
            return
        else:
            # Start processing thread IF NOT already processing
            # The processing thread itself will handle the lock internally
            print(f"Starting processing thread for command: '{user_command}'")
            processing_thread = threading.Thread(
                target=self._processing_thread_target,
                args=(original_doc_text, user_command), # Pass context & command
                daemon=True
            )
            processing_thread.start()
    
    def _cleanup(self):
        print("Cleaning up...")
        if hasattr(self, 'hotkey_listener') and self.hotkey_listener:
            self.hotkey_listener.stop()
        if self.is_recording:
            self.stop_recording_event.set()
        # Add any other necessary cleanup
        print("Cleanup complete")

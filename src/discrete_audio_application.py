import queue
import threading
import time
import numpy as np
from pynput import keyboard
import traceback
from typing import Optional, Dict, Any, Union, List

# Assuming these imports are correct relative to your project structure
from src.app_config import AppConfig
from src.engines.processing_engine import ProcessingEngine
from src.engines.context_engine import ContextEngine
from src import platform_utils_macos as platform_utils # Keep platform-specific name clear
from src.handlers.asr_handler_interface import ASRHandlerInterface
from src.handlers.audio_handler import AudioHandler
from src.handlers.llm_handler import LLMHandler
from src.application_interface import ApplicationInterface

# Define constants for actions
_ACTION_START_RECORDING = "START_RECORDING"

class DiscreteAudioApplication(ApplicationInterface):
    """
    Main application class orchestrating audio recording, processing,
    and interaction with ASR, LLM, and context engines based on user commands
    triggered via hotkeys.
    """
    def __init__(self, context_engine: ContextEngine, processing_engine: ProcessingEngine,
                 asr_handler: ASRHandlerInterface, llm_handler: LLMHandler, audio_handler: AudioHandler,
                 raw_config: Dict[str, Any]):
        """
        Initializes the Application.

        Args:
            context_engine: Engine to manage application context.
            processing_engine: Engine to process user commands with context.
            asr_handler: Handler for Automatic Speech Recognition.
            llm_handler: Handler for Large Language Model interaction.
            audio_handler: Handler for audio recording and processing.
            raw_config: The raw configuration dictionary.
        """
        # Configuration
        self.config: AppConfig = AppConfig(raw_config)

        # Core Components/Handlers
        self.context_engine: ContextEngine = context_engine
        self.processing_engine: ProcessingEngine = processing_engine
        self.asr_handler: ASRHandlerInterface = asr_handler
        self.llm_handler: LLMHandler = llm_handler
        self.audio_handler: AudioHandler = audio_handler

        # Application State
        self.is_recording: bool = False
        self.is_processing: bool = False
        self.stop_recording_event: threading.Event = threading.Event()
        # Queue for audio chunks from the recording thread
        self.audio_queue: queue.Queue[np.ndarray] = queue.Queue()
        # Queue for actions triggered by external events (like hotkeys)
        self.action_queue: queue.Queue[str] = queue.Queue()
        self.processing_lock: threading.Lock = threading.Lock() # Ensures only one processing task runs
        self.current_context_data: Dict[str, Optional[str]] = {"app_name": None, "doc_text": None}

        # Thread Handles
        self.recording_thread_handle: Optional[threading.Thread] = None
        self.monitor_thread_handle: Optional[threading.Thread] = None
        self.hotkey_listener: Optional[keyboard.Listener] = None

    def run(self) -> None:
        """
        Starts the application, sets up listeners, and enters the main event loop.
        """
        self._print_initial_info()
        try:
            self._setup_hotkey_listener()
            self._run_event_loop()
        except Exception as e:
            print(f"\nFATAL ERROR during application setup or run: {e}")
            traceback.print_exc()
        finally:
            self._cleanup()
            print("Inten shut down.")

    def _print_initial_info(self) -> None:
        """Prints initial configuration and status information to the console."""
        print("\n--- Inten Tool (Document Command Mode) ---")
        print(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
        if not platform_utils.is_macos():
             print("WARNING: Running on non-macOS. Application context/interaction may be limited.")

        print(f"ASR Provider: {self.config.asr_provider} ({self.config.asr_model if self.config.asr_provider == 'openai_api' else self.config.asr_local_model_size})")
        print(f"LLM Provider: {self.config.llm_provider} ({self.config.llm_model})")
        print(f"VAD Enabled: {self.config.vad_enabled}")
        if self.config.vad_enabled:
            print(f"Stops after {self.config.vad_silence_duration_ms}ms of silence (Aggressiveness: {self.config.vad_aggressiveness}).")

        print(f"\nTarget Application Context: Determined at runtime (initially TextEdit if macOS).")
        print(f"Press '{self.config.start_recording_hotkey}' when the target application is active to issue a command.")
        if platform_utils.is_macos():
            print("Ensure required Accessibility/Automation permissions are granted (macOS).")
        print("Press Ctrl+C in the console to quit.")

    def _setup_hotkey_listener(self) -> None:
        """
        Registers the global hotkey listener using pynput.
        Raises:
            RuntimeError: If the hotkey listener cannot be set up.
        """
        hotkey_str = self.config.start_recording_hotkey
        print(f"Setting up hotkey: {hotkey_str}")
        try:
            # Define the callback for key press events
            def on_press_wrapper(key):
                self._on_keyboard_press(key)

            # Create and start the listener in a non-blocking way
            listener = keyboard.Listener(on_press=on_press_wrapper)
            listener.start()
            self.hotkey_listener = listener # Store the listener instance
            print(f"Hotkey '{hotkey_str}' registration initiated.")
            # Note: Listener runs in its own thread managed by pynput.

        except Exception as e:
            # Catch a broad exception range as pynput setup can fail for various reasons
            print(f"\nERROR setting hotkey '{hotkey_str}': {e}")
            print("This might be due to permissions issues (e.g., macOS Accessibility/Input Monitoring, Wayland).")
            print("Try checking System Settings > Privacy & Security.")
            print("Running with elevated privileges (sudo/Administrator) might be needed but use with caution.")
            # Stop the application if the hotkey is critical
            raise RuntimeError(f"Failed to set up hotkey listener for '{hotkey_str}'") from e

    def _on_keyboard_press(self, key: Union[keyboard.Key, keyboard.KeyCode, None]) -> None:
        """
        Internal callback triggered by the keyboard listener.
        Checks if the pressed key matches the configured hotkey.

        Args:
            key: The key object from pynput (can be Key or KeyCode).
        """
        hotkey_str = self.config.start_recording_hotkey
        target_key: Optional[Union[keyboard.Key, keyboard.KeyCode]] = None

        # Attempt to parse the hotkey string into a pynput key object
        try:
            # Check if it's a special key (like Key.f9, Key.ctrl_l)
            target_key = getattr(keyboard.Key, hotkey_str)
        except AttributeError:
            # If not a special key, treat it as a character key
            if len(hotkey_str) == 1:
                 target_key = keyboard.KeyCode.from_char(hotkey_str)
            else:
                 # Handle potential complex hotkey strings if needed in the future
                 # For now, log an error if it's not a recognized special key or single char
                 if not hasattr(self, '_logged_invalid_hotkey'): # Log only once
                     print(f"ERROR: Invalid or unsupported hotkey string in config: '{hotkey_str}'. Only single characters or names from keyboard.Key (e.g., 'f9', 'ctrl_l') are currently directly supported by this check.")
                     self._logged_invalid_hotkey = True # Prevent log flooding
                 return

        # Compare the pressed key with the target hotkey
        if key == target_key:
            self._trigger_start_recording(hotkey_str) # Pass the string representation for logging

    def _trigger_start_recording(self, hotkey_name: str) -> None:
        """
        Checks application state and queues the start recording action.
        This method is called from the keyboard listener thread, so it
        should be quick and avoid blocking.

        Args:
            hotkey_name: The string representation of the hotkey that was pressed.
        """
        timestamp = time.strftime('%H:%M:%S')
        # Prevent queuing multiple start actions if already busy
        if self.is_processing:
            print(f"[{timestamp}] Hotkey '{hotkey_name}' detected, but PROCESSING is busy.")
            # Optional: Provide user feedback (e.g., system beep)
            # platform_utils.beep()
            return
        if self.is_recording:
            print(f"[{timestamp}] Hotkey '{hotkey_name}' detected, but already RECORDING.")
            # Optional: Provide user feedback
            # platform_utils.beep()
            return

        print(f"[{timestamp}] Hotkey '{hotkey_name}' detected. Queuing context check & start command.")
        self.action_queue.put(_ACTION_START_RECORDING) # Signal the main loop

    def _run_event_loop(self) -> None:
        """
        The main event loop, processing actions from the action queue.
        """
        print("Entering main event loop. Waiting for hotkey...")
        try:
            while True:
                try:
                    # Block waiting for an action from the queue (e.g., hotkey press)
                    # Timeout prevents hard lock, allowing periodic checks or Ctrl+C
                    action = self.action_queue.get(block=True, timeout=1.0)

                    if action == _ACTION_START_RECORDING:
                        # Handle the recording initiation in the main thread
                        self._initiate_recording_process()
                    else:
                        print(f"Warning: Unknown action received in queue: {action}")

                except queue.Empty:
                    # Timeout reached, no action in the queue. Loop continues.
                    # This is normal operation when waiting for the hotkey.
                    pass
                except Exception as e:
                    print(f"\nError in event loop action processing: {e}")
                    traceback.print_exc()
                    # Decide if the error is recoverable or should halt the loop

        except KeyboardInterrupt:
            print("\nCtrl+C detected. Initiating shutdown...")
        except Exception as e:
            # Catch unexpected errors in the loop itself
            print(f"\nAn unexpected error occurred in the main loop: {e}")
            traceback.print_exc()
        # Cleanup is handled in the finally block of the run method

    def _initiate_recording_process(self) -> None:
        """
        Checks context, and if valid, starts audio recording and monitoring threads.
        This runs in the main thread after being triggered by the action queue.
        """
        timestamp = time.strftime('%H:%M:%S')
        # Double-check state flags immediately before starting
        if self.is_recording or self.is_processing:
            print(f"[{timestamp}] Start action received, but state changed before execution. "
                  f"Recording={self.is_recording}, Processing={self.is_processing}. Aborting start.")
            return

        # 1. Check Active Application Context (Platform Specific)
        print(f"[{timestamp}] Checking active window context...")
        active_window_info = platform_utils.get_active_window_info() # Assumes this returns a dict or None
        if not active_window_info or not active_window_info.get("app_name"):
            print(f"[{timestamp}] Error: Could not determine active window or application name. Aborting.")
            # Optional: User feedback (e.g., different beep)
            return

        app_name = active_window_info.get("app_name", "Unknown")
        self.current_context_data['app_name'] = app_name
        print(f"[{timestamp}] Active application: {app_name}")

        # 2. Get Contextual Data (e.g., document text) using the ContextEngine
        # This might involve platform-specific calls via the engine
        print(f"[{timestamp}] Fetching context from '{app_name}'...")
        try:
            # The context engine determines if/how to get context based on app_name
            original_doc_text = self.context_engine.get_context(self.current_context_data)
            # Handle cases where context retrieval might fail or return None meaningfully
            if original_doc_text is None:
                 print(f"[{timestamp}] Warning: Context engine returned None for '{app_name}'. Proceeding without document context.")
                 # Decide if this is acceptable or should abort. Assuming proceed for now.
            else:
                 print(f"[{timestamp}] Context retrieved successfully.")
                 # Store it if needed, though it's passed directly to monitor thread here
                 self.current_context_data['doc_text'] = original_doc_text

        except Exception as e:
            print(f"[{timestamp}] Error fetching context for '{app_name}': {e}")
            # Decide how to handle context errors (e.g., abort, proceed without context)
            # Aborting for now if context fetch fails unexpectedly.
            return

        # 3. Start Recording and Monitoring
        self.is_recording = True
        self.stop_recording_event.clear()
        self.audio_queue = queue.Queue() # Ensure queue is empty before starting

        print(f"[{timestamp}] Context OK. Starting command recording... (VAD: {self.config.vad_enabled})")
        print(f"[{timestamp}] Speak your command now (stops recording after {self.config.vad_silence_duration_ms}ms silence)...")

        # Start the audio recording thread
        self.recording_thread_handle = threading.Thread(
            target=self.audio_handler.record_audio_stream_with_vad,
            args=(self.stop_recording_event, self.audio_queue, self.config.vad_config),
            daemon=True, # Daemon threads exit automatically when the main program exits
            name="AudioRecordingThread"
        )
        self.recording_thread_handle.start()

        # Start the VAD monitor thread, passing the context obtained *for this specific command*
        self.monitor_thread_handle = threading.Thread(
            target=self._vad_monitor_and_process_thread_target,
            args=(original_doc_text,), # Pass the fetched context
            daemon=True,
            name="VADMonitorThread"
        )
        self.monitor_thread_handle.start()

    def _vad_monitor_and_process_thread_target(self, original_doc_context: Optional[str]) -> None:
        """
        Thread target: Waits for VAD to signal stop, collects audio,
        transcribes it, and then queues the processing task if not already processing.

        Args:
            original_doc_context: The document text captured at the start of the command.
                                  Can be None if context retrieval failed or wasn't applicable.
        """
        timestamp = time.strftime('%H:%M:%S')
        # Block until the stop_recording_event is set (by VAD or potentially manual stop)
        self.stop_recording_event.wait()
        print(f"[{timestamp}] Recording stop event detected by monitor thread.")

        # Important: Set is_recording to False *after* the event is detected
        # and ideally before starting potentially long processing (like ASR).
        # This allows a new hotkey press to be potentially registered sooner
        # if ASR/processing takes time.
        if self.is_recording: # Check ensures we don't unset if already unset elsewhere
             self.is_recording = False
             print(f"[{timestamp}] Recording state set to False.")
        else:
             # This might happen if cleanup initiated a stop simultaneously.
             print(f"[{timestamp}] Monitor detected stop, but recording state was already False.")


        # Retrieve all audio data from the queue
        print(f"[{timestamp}] Collecting command audio chunks...")
        collected_audio_chunks: List[np.ndarray] = []
        while not self.audio_queue.empty():
            try:
                # Use get_nowait for safety, though queue should be stable after recording stops
                chunk = self.audio_queue.get_nowait()
                collected_audio_chunks.append(chunk)
            except queue.Empty:
                # This can happen in rare race conditions, should be harmless
                break
            except Exception as e:
                print(f"[{timestamp}] Error retrieving audio chunk from queue: {e}")
                # Decide if we can proceed or should abort
                return # Abort if queue access fails unexpectedly

        if not collected_audio_chunks:
            print(f"[{timestamp}] No command audio collected after recording stopped. Nothing to process.")
            return

        print(f"[{timestamp}] {len(collected_audio_chunks)} audio chunks collected.")

        # --- Transcribe the collected audio (User's Command) ---
        try:
            # Concatenate numpy arrays if audio handler expects a single array
            command_audio_data: np.ndarray = np.concatenate(collected_audio_chunks, axis=0)
            # Convert to a format suitable for ASR (e.g., WAV buffer)
            # Assuming audio_handler provides sample_rate and channels correctly
            command_audio_buffer: Optional[bytes] = self.audio_handler.save_wav_to_buffer(
                command_audio_data,
                self.audio_handler.sample_rate, # Get SR from handler
                self.audio_handler.channels     # Get channels from handler
            )
        except ValueError as e:
            # Handle potential errors during concatenation (e.g., mismatched shapes)
            print(f"[{timestamp}] Error processing collected audio chunks: {e}")
            return
        except Exception as e:
            # Catch other potential errors in audio processing/saving
            print(f"[{timestamp}] Error preparing audio buffer: {e}")
            return


        if not command_audio_buffer:
            print(f"[{timestamp}] Failed to create command audio buffer. Cannot transcribe.")
            return

        print(f"[{timestamp}] Transcribing user command...")
        user_command: Optional[str] = None
        try:
            # Pass ASR configuration details if needed by the handler implementation
            # For simplicity here, assume transcribe_audio uses pre-configured settings
            user_command = self.asr_handler.transcribe_audio(
                audio_buffer=command_audio_buffer,
                # Optionally pass more config:
                # model=self.config.asr_model,
                # provider=self.config.asr_provider,
                # etc.
            )
        except Exception as e:
            print(f"[{timestamp}] Error during ASR transcription: {e}")
            traceback.print_exc()
            # Do not proceed if transcription fails

        if not user_command or not user_command.strip():
            print(f"[{timestamp}] Command transcription failed or resulted in empty text.")
            return
        # --- Command Transcription Complete ---
        print(f"[{timestamp}] Transcription complete: '{user_command}'")


        # --- Initiate Processing ---
        # Use a lock to ensure only one processing thread runs at a time.
        # Check the lock *before* starting the thread to avoid unnecessary thread creation.
        if self.processing_lock.locked():
            print(f"[{timestamp}] Processing lock is held. Another command is likely being processed. Skipping this one.")
            return
        else:
             # We don't acquire the lock here, the processing thread will.
             # This check just prevents queueing up multiple processing threads if
             # transcription was very fast and another hotkey press occurred.
            print(f"[{timestamp}] Starting processing thread for the command.")
            # The processing thread itself will set self.is_processing and manage the lock.
            processing_thread = threading.Thread(
                target=self._processing_thread_target,
                args=(original_doc_context, user_command), # Pass context & transcribed command
                daemon=True, # Ensures thread doesn't block exit if main thread finishes
                name="ProcessingThread"
            )
            processing_thread.start()
            # Note: We don't join this thread here; it runs independently.

    def _processing_thread_target(self, original_doc_context: Optional[str], user_command: str) -> None:
        """
        Thread target: Executes the main processing pipeline using the engines.
        Acquires a lock to ensure exclusivity and manages the is_processing state.

        Args:
            original_doc_context: The document context captured before the command.
            user_command: The transcribed user command.
        """
        timestamp = time.strftime('%H:%M:%S')
        # Basic validation
        if not user_command: # Should have been checked before, but double-check
            print(f"[{timestamp}] Error (Processing Thread): No user command provided.")
            return
        # Check for None context explicitly if your processing engine requires it
        # if original_doc_context is None:
        #     print(f"[{timestamp}] Warning (Processing Thread): Document context is None.")
            # Decide if processing can continue or should stop.

        # Acquire lock and set processing state
        if not self.processing_lock.acquire(blocking=False):
             # This should ideally not happen due to the check before starting the thread,
             # but serves as a final safety measure against race conditions.
             print(f"[{timestamp}] Error (Processing Thread): Could not acquire processing lock. Aborting.")
             return

        self.is_processing = True
        print(f"[{timestamp}] --- Starting Processing Pipeline ---")
        print(f"[{timestamp}] Context App: {self.current_context_data.get('app_name', 'N/A')}")
        # Avoid printing potentially large document context here unless debugging
        # print(f"[{timestamp}] Context Text (Preview): {original_doc_context[:100] + '...' if original_doc_context else 'None'}")
        print(f"[{timestamp}] User Command: '{user_command}'")

        try:
            # Call the main processing logic in the ProcessingEngine
            self.processing_engine.process(
                current_context=self.current_context_data, # Pass the dictionary
                processing_text=original_doc_context,
                user_command=user_command
            )
            print(f"[{timestamp}] Processing engine finished successfully.")

        except Exception as e:
            print(f"[{timestamp}] Error during processing pipeline execution: {e}")
            traceback.print_exc()
        finally:
            # --- Crucial Cleanup for this thread ---
            self.is_processing = False
            self.processing_lock.release()
            print(f"[{timestamp}] --- Processing Pipeline Finished ---")
            print(f"[{timestamp}] Ready for next command (Press '{self.config.start_recording_hotkey}').")


    def _cleanup(self) -> None:
        """
        Performs cleanup operations when the application is shutting down.
        Stops listeners and signals running threads to exit.
        """
        print("Initiating cleanup...")

        # Stop the hotkey listener
        if self.hotkey_listener:
            print("Stopping hotkey listener...")
            try:
                self.hotkey_listener.stop()
                # Note: Joining the listener thread might be needed if precise shutdown is critical,
                # but pynput's stop() is generally sufficient for daemon listeners.
                # self.hotkey_listener.join() # Optional: wait for listener thread to exit
                print("Hotkey listener stopped.")
            except Exception as e:
                print(f"Error stopping hotkey listener: {e}")
            self.hotkey_listener = None

        # Signal recording thread to stop if it's running
        if self.is_recording:
            print("Signaling active recording thread to stop...")
            self.stop_recording_event.set()
            # Wait briefly for the recording thread to potentially finish processing the event
            if self.recording_thread_handle and self.recording_thread_handle.is_alive():
                 self.recording_thread_handle.join(timeout=0.5) # Wait max 0.5 sec
                 if self.recording_thread_handle.is_alive():
                      print("Warning: Recording thread did not exit cleanly.")


        # Signal monitor thread if it's potentially waiting on the event
        # (it usually exits quickly after the event is set, but signal just in case)
        if not self.stop_recording_event.is_set():
             self.stop_recording_event.set() # Ensure it's set for monitor thread too

        if self.monitor_thread_handle and self.monitor_thread_handle.is_alive():
             print("Waiting briefly for monitor thread...")
             self.monitor_thread_handle.join(timeout=0.5) # Wait max 0.5 sec
             if self.monitor_thread_handle.is_alive():
                  print("Warning: Monitor thread did not exit cleanly.")


        # Note: Processing thread is a daemon thread, it will be terminated automatically
        # if the main thread exits. If graceful shutdown of processing is required,
        # a similar signaling mechanism (e.g., another event) would be needed.

        # Clear queues potentially? Not usually necessary as daemon threads will die.
        # while not self.audio_queue.empty(): self.audio_queue.get()
        # while not self.action_queue.empty(): self.action_queue.get()

        print("Cleanup sequence complete.")

# Example Usage (assuming you have the necessary handlers and engines instantiated)
# if __name__ == "__main__":
#     # Load your config dictionary (e.g., from a file)
#     config = load_config_from_file(...)
#
#     # Instantiate handlers and engines
#     audio_h = AudioHandler(...)
#     asr_h = MyASRHandler(...) # Your implementation
#     llm_h = MyLLMHandler(...) # Your implementation
#     context_e = ContextEngine(...)
#     processing_e = ProcessingEngine(asr_handler=asr_h, llm_handler=llm_h, ...)
#
#     # Create and run the application
#     app = Application(context_e, processing_e, asr_h, llm_h, audio_h, config)
#     app.run()
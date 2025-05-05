import queue
import threading
import time
import traceback
from typing import Any

import numpy as np

from src import (
    platform_utils_macos as platform_utils,  # Keep platform-specific name clear
)

# Assuming these imports are correct relative to your project structure
from src.app_config import AppConfig
from src.application_interface import ApplicationInterface
from src.engines.context_engine import ContextEngine
from src.engines.processing_engine import ProcessingEngine
from src.handlers.asr_handler_interface import ASRHandlerInterface
from src.handlers.audio_handler import AudioHandler
from src.handlers.llm_handler import LLMHandler

# Define constants for actions
_ACTION_START_RECORDING = "START_RECORDING"
class DiscreteAudioApplication(ApplicationInterface):
    """
    Main application class orchestrating audio recording, processing,
    and interaction with ASR, LLM, and context engines based on user commands
    triggered via external signals (like hotkeys managed elsewhere).
    """
    def __init__(self, context_engine: ContextEngine, processing_engine: ProcessingEngine,
                 asr_handler: ASRHandlerInterface, llm_handler: LLMHandler, audio_handler: AudioHandler,
                 raw_config: dict[str, Any]):
        """
        Initializes the Application.
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
        # Queue for audio chunks from the recording thread
        self.audio_queue: queue.Queue[np.ndarray] = queue.Queue()
        # Queue for actions triggered by external events (like hotkeys via ApplicationManager)
        self.action_queue: queue.Queue[str] = queue.Queue()
        self.processing_lock: threading.Lock = threading.Lock() # Ensures only one processing task runs
        self.current_context_data: dict[str, str | None] = {"app_name": None, "doc_text": None}

        # Thread Handles
        self.recording_thread_handle: threading.Thread | None = None
        self.monitor_thread_handle: threading.Thread | None = None

        # Status queue for UI updates (set by ApplicationManager)
        self.status_queue: queue.Queue | None = None

    def run(self) -> None:
        """
        Starts the application's event loop in the background thread.
        Hotkey listener is managed externally now.
        """
        self._print_initial_info()
        try:
            self.stop_recording_event: threading.Event = threading.Event()
            self.stop_application_event: threading.Event = threading.Event()
            self._run_event_loop() # Directly run the event loop
        except Exception as e:
            print(f"\nFATAL ERROR during application run: {e}")
            traceback.print_exc()
        finally:
            self._cleanup()

    def _print_initial_info(self) -> None:
        """Prints initial configuration and status information to the console."""
        print("\n--- Inten Tool (Document Command Mode) ---")
        print(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
        if not platform_utils.is_macos():
             print("WARNING: Running on non-macOS. Application context/interaction may be limited.")

        print(f"LLM Source: {self.config.llm_source} ({self.config.llm_model})")
        print(f"VAD Enabled: {self.config.vad_enabled}")
        if self.config.vad_enabled:
            print(f"Stops after {self.config.silence_duration_ms}ms of silence (Aggressiveness: {self.config.vad_aggressiveness}).")

        print("\nTarget Application Context: Determined at runtime (initially TextEdit if macOS).")
        print(f"Press '{self.config.start_recording_hotkey}' when the target application is active to issue a command.")
        if platform_utils.is_macos():
            print("Ensure required Accessibility/Automation permissions are granted (macOS).")
        print("Inten background process running. Use UI or Ctrl+C in original console to quit.") # Adjusted message

    # REMOVE _setup_hotkey_listener method completely
    # REMOVE _on_keyboard_press method completely
    # REMOVE _trigger_start_recording method completely

    def _run_event_loop(self) -> None:
        """
        The main event loop for the background thread, processing actions
        received from the action queue (triggered externally).
        """
        print("Background event loop started. Waiting for actions...")
        try:
            while not self.stop_application_event.is_set():
                try:
                    # Block waiting for an action from the queue
                    # Use a timeout so the stop_application_event check runs periodically
                    action = self.action_queue.get(block=True, timeout=0.2)

                    if action == _ACTION_START_RECORDING:
                        self._initiate_recording_process()
                    else:
                        print(f"Warning: Unknown action received in queue: {action}")

                except queue.Empty:
                    # Timeout reached, loop continues to check stop event.
                    pass
                except Exception as e:
                    print(f"\nError in background event loop action processing: {e}")
                    traceback.print_exc()

        except Exception as e:
            print(f"\nAn unexpected error occurred in the background loop: {e}")
            traceback.print_exc()
        finally:
            print("Background event loop finished.")

    def _initiate_recording_process(self) -> None:
        """
        Checks context, and if valid, starts audio recording and monitoring threads.
        """
        timestamp = time.strftime('%H:%M:%S')
        # Double-check state flags immediately before starting
        if self.is_recording or self.is_processing:
            print(f"[{timestamp}] Start action received, but state changed before execution. "
                  f"Recording={self.is_recording}, Processing={self.is_processing}. Aborting start.")
            return

        # Clear the stop_recording_event before starting a new recording
        self.stop_recording_event.clear()

        # 1. Check Active Application Context (Platform Specific)
        print(f"[{timestamp}] Checking active window context...")
        active_window_info = platform_utils.get_active_window_info()
        if not active_window_info or not active_window_info.get("app_name"):
            print(f"[{timestamp}] Error: Could not determine active window or application name. Aborting.")
            return

        app_name = active_window_info.get("app_name", "Unknown")
        self.current_context_data['app_name'] = app_name
        print(f"[{timestamp}] Active application: {app_name}")

        # 2. Start fetching context in a background thread
        def fetch_context():
            print(f"[{timestamp}] Fetching context from '{app_name}' (in background)...")
            try:
                original_doc_text = self.context_engine.get_context(self.current_context_data)
                if original_doc_text is None:
                    print(f"[{timestamp}] Warning: Context engine returned None for '{app_name}'. Proceeding without document context.")
                else:
                    print(f"[{timestamp}] Context retrieved successfully.")
                    self.current_context_data['doc_text'] = original_doc_text
            except Exception as e:
                print(f"[{timestamp}] Error fetching context for '{app_name}': {e}")

        context_thread = threading.Thread(target=fetch_context, daemon=True, name="ContextFetchThread")
        context_thread.start()

        # 3. Start Recording and Monitoring (immediately, in parallel with context fetch)
        self.is_recording = True
        # Clear the queue here, just before starting recording
        while not self.audio_queue.empty():
            try:
                self.audio_queue.get_nowait()
            except queue.Empty:
                break

        print(f"[{timestamp}] Context fetch started in background. Starting command recording... (VAD: {self.config.vad_enabled})")
        print(f"[{timestamp}] Speak your command now (stops recording after {self.config.silence_duration_ms}ms silence)...")

        # Start the audio recording thread
        self.recording_thread_handle = threading.Thread(
            target=self.audio_handler.record_audio_stream_with_vad,
            args=(
                self.stop_recording_event,
                self.audio_queue,
                {
                    'enabled': self.config.vad_enabled,
                    'aggressiveness': self.config.vad_aggressiveness,
                    'silence_duration_ms': self.config.silence_duration_ms,
                    'frame_duration_ms': self.config.frame_duration_ms
                }
            ),
            daemon=True,
            name="AudioRecordingThread"
        )
        self.recording_thread_handle.start()

        # Start the VAD monitor thread, passing the context obtained *for this specific command*
        self.monitor_thread_handle = threading.Thread(
            target=self._vad_monitor_and_process_thread_target,
            daemon=True,
            name="VADMonitorThread"
        )
        self.monitor_thread_handle.start()

    def _vad_monitor_and_process_thread_target(self) -> None:
        """
        Thread target: Waits for VAD to signal stop, collects audio,
        transcribes it, and then queues the processing task if not already processing.
        (Modified: always fetch latest context from self.current_context_data)
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
        collected_audio_chunks: list[np.ndarray] = []
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
            command_audio_buffer: bytes | None = self.audio_handler.save_wav_to_buffer(
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
        user_command: str | None = None
        try:
            # Pass ASR configuration details if needed by the handler implementation
            # For simplicity here, assume transcribe_audio uses pre-configured settings
            user_command = self.asr_handler.transcribe_audio(
                audio_buffer=command_audio_buffer
            )
        except Exception as e:
            print(f"[{timestamp}] Error during ASR transcription: {e}")
            traceback.print_exc()
            # Do not proceed if transcription fails

        if not user_command or not user_command.strip():
            print(f"[{timestamp}] Command transcription failed or resulted in empty text.")
            if self.status_queue is not None:
                try:
                    self.status_queue.put("Ready")
                except Exception as e:
                    print(f"[{timestamp}] Error putting status in status_queue: {e}")
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
            # Always fetch the latest context from self.current_context_data
            latest_doc_context = self.current_context_data.get('doc_text')
            # Clear the doc_text to prevent reuse of stale context
            self.current_context_data['doc_text'] = None
            print(f"[{timestamp}] Starting processing thread for the command.")
            processing_thread = threading.Thread(
                target=self._processing_thread_target,
                args=(latest_doc_context, user_command), # Pass latest context & transcribed command
                daemon=True,
                name="ProcessingThread"
            )
            processing_thread.start()
            # Note: We don't join this thread here; it runs independently.

    def _processing_thread_target(self, original_doc_context: str | None, user_command: str) -> None:
        """
        Thread target: Executes the main processing pipeline using the engines.
        Acquires a lock to ensure exclusivity and manages the is_processing state.
        (Keep this method as is)
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
            print(f"[{timestamp}] Ready for next command.")

            # Notify UI via status_queue if available
            if self.status_queue is not None:
                try:
                    self.status_queue.put("Ready")
                except Exception as e:
                    print(f"[{timestamp}] Error putting status in status_queue: {e}")

    def _cleanup(self) -> None:
        """
        Performs cleanup operations for the background application thread.
        Listener cleanup is handled externally.
        """
        print("Initiating background application cleanup...")

        # Signal all threads to stop
        if not self.stop_recording_event.is_set():
            print("Signaling recording thread to stop...")
            self.stop_recording_event.set()

        if not self.stop_application_event.is_set():
            print("Signaling application to stop...")
            self.stop_application_event.set()

        # Clear queues to prevent memory leaks
        print("Clearing queues...")
        while not self.audio_queue.empty():
            try:
                self.audio_queue.get_nowait()
            except queue.Empty:
                break

        while not self.action_queue.empty():
            try:
                self.action_queue.get_nowait()
            except queue.Empty:
                break

        # Wait for threads to finish with increased timeout
        if self.recording_thread_handle and self.recording_thread_handle.is_alive():
            print("Waiting for recording thread...")
            self.recording_thread_handle.join(timeout=1.0)  # Increased timeout
            if self.recording_thread_handle.is_alive():
                print("Warning: Recording thread did not exit cleanly during cleanup.")

        if self.monitor_thread_handle and self.monitor_thread_handle.is_alive():
            print("Waiting for monitor thread...")
            self.monitor_thread_handle.join(timeout=1.0)  # Increased timeout
            if self.monitor_thread_handle.is_alive():
                print("Warning: Monitor thread did not exit cleanly during cleanup.")

        # Clear context data
        print("Clearing context data...")
        self.current_context_data = {"app_name": None, "doc_text": None}

        # Release processing lock if held
        if self.processing_lock.locked():
            print("Releasing processing lock...")
            self.processing_lock.release()

        print("Background application cleanup sequence complete.")
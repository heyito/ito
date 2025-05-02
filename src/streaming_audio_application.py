import logging
import queue
import threading
import time
import traceback
import asyncio # Added
from typing import Any, Dict, List, Optional, Union
import os # Added for path validation

from pynput import keyboard
import numpy as np
from src.app_config import AppConfig
from src.application_interface import ApplicationInterface
from src.handlers.audio_handler import AudioHandler
from src.handlers.vosk_processor import VoskProcessor
from src.engines.context_engine import ContextEngine # Added
from src.engines.processing_engine import ProcessingEngine # Added
from src.handlers.llm_handler import LLMHandler # Added
from src import platform_utils_macos as platform_utils # Added for context

# Actions for the queue (can be simplified)
_ACTION_TOGGLE_STREAMING = "TOGGLE_STREAMING"
# Add action for processing
_ACTION_PROCESS_TRANSCRIPT = "PROCESS_TRANSCRIPT"
_ACTION_FINALIZE_STREAM = "FINALIZE_STREAM" # New action

class StreamingAudioApplication(ApplicationInterface):
    # Add type hints for new handlers/engines
    def __init__(self,
                 audio_handler: AudioHandler,
                 context_engine: ContextEngine,     # Added
                 processing_engine: ProcessingEngine, # Added
                 llm_handler: LLMHandler,           # Added (though ProcessingEngine might use it internally)
                 raw_config: Dict[str, Any]):
        """
        Initializes the streaming audio application.

        Args:
            audio_handler: Instance of AudioHandler for capturing audio.
            context_engine: Instance of ContextEngine for getting app context.
            processing_engine: Instance of ProcessingEngine for handling commands.
            llm_handler: Instance of LLMHandler (may be used by processing_engine).
            raw_config: Dictionary containing application configuration.
                       Expected to have ['Vosk']['model_path'].
        """
        self.config: AppConfig = AppConfig(raw_config)
        self.audio_handler: AudioHandler = audio_handler
        self.context_engine: ContextEngine = context_engine         # Added
        self.processing_engine: ProcessingEngine = processing_engine # Added
        self.llm_handler: LLMHandler = llm_handler                 # Added

        # --- State Flags ---
        self.is_streaming: bool = False
        self.is_processing: bool = False # Added
        self.stop_audio_capture_event = threading.Event() # Event to signal audio capture thread

        # --- Threading & Asyncio ---
        self.action_queue = queue.Queue() # For triggering actions from hotkey thread
        self.processing_lock: threading.Lock = threading.Lock() # Added
        self.hotkey_listener = None # keyboard or pynput listener
        self.audio_capture_thread_handle: Optional[threading.Thread] = None
        self.context_fetch_thread_handle: Optional[threading.Thread] = None # Added for background context fetching
        self.processing_thread_handle: Optional[threading.Thread] = None # Added

        self.asyncio_loop: Optional[asyncio.AbstractEventLoop] = None
        self.asyncio_loop_thread: Optional[threading.Thread] = None

        # --- Vosk specific ---
        self.vosk_processor: Optional[VoskProcessor] = None
        self.audio_stream_queue: Optional[asyncio.Queue] = None # Audio: AudioHandler -> VoskProcessor
        self.transcript_queue: Optional[asyncio.Queue] = None # Transcript: VoskProcessor -> App
        self._transcript_consumer_task: Optional[asyncio.Task] = None
        self._current_partial_transcript: str = "" # Store the latest partial line

        # --- Current Context (Simplified for streaming example) ---
        self.current_context_data: Dict[str, Any] = {"app_name": None, "doc_text": None} # Modified to match discrete

        self.raw_config = raw_config

        # --- Determine and Validate Vosk Model Path (Expected from config) ---
        vosk_config = raw_config.get('Vosk')
        if not vosk_config or 'model_path' not in vosk_config:
            raise ValueError("Configuration Error: Missing 'model_path' under [Vosk] section in the provided configuration.")

        self.vosk_model_path = vosk_config['model_path']

        # Validate that the model path exists
        if not os.path.exists(self.vosk_model_path):
            raise FileNotFoundError(f"Vosk model directory not found at specified path: {self.vosk_model_path}. Please ensure the path is correct in the configuration.")

        print(f"Validated Vosk model path from config: {self.vosk_model_path}")

        print("StreamingAudioApplication Initialized (using Vosk)")


    def run(self) -> None:
        """
        Starts the application, sets up listeners, and enters the main event loop.
        """
        self._print_initial_info()
        try:
            self._setup_hotkey_listener()
            self._start_asyncio_loop()
            self._run_event_loop()
        except Exception as e:
            print(f"\nFATAL ERROR during application setup or run: {e}")
            traceback.print_exc()
        finally:
            self._cleanup()
            print("Streaming App shut down.")

    def _print_initial_info(self) -> None:
        """Prints initial configuration and status information."""
        print("\n--- Real-time Streaming Transcription ---")
        print(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Using OpenAI Real-time API via WebRTC")
        print(f"Audio Device Index: {self.audio_handler.device_index}")
        print(f"Audio Sample Rate: {self.audio_handler.sample_rate}")
        print(f"Audio Channels: {self.audio_handler.channels}")
        print(f"\nPress '{self.config.start_recording_hotkey}' to START/STOP streaming transcription.")
        print("Transcripts will be printed to the console.")
        print("Press Ctrl+C in the console to quit.")

    def _start_asyncio_loop(self):
        """Starts the asyncio event loop in a separate thread."""
        if self.asyncio_loop_thread is not None:
            print("Asyncio loop thread already running.")
            return

        def loop_thread_target():
            print("Asyncio loop thread started.")
            self.asyncio_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.asyncio_loop)
            try:
                self.asyncio_loop.run_forever()
            finally:
                # Cleanup tasks before loop stops
                if self.asyncio_loop.is_running():
                     print("Shutting down asyncio loop...")
                     # Gather all tasks to cancel them
                     tasks = asyncio.all_tasks(self.asyncio_loop)
                     for task in tasks:
                          task.cancel()
                     # Run loop until all tasks are cancelled
                     # self.asyncio_loop.run_until_complete(asyncio.gather(*tasks, return_exceptions=True)) # Needs careful handling
                     self.asyncio_loop.run_until_complete(self.asyncio_loop.shutdown_asyncgens())
                     self.asyncio_loop.close()
                print("Asyncio loop thread finished.")

        self.asyncio_loop_thread = threading.Thread(target=loop_thread_target, daemon=True, name="AsyncioLoopThread")
        self.asyncio_loop_thread.start()
        # Wait briefly for the loop to be set
        time.sleep(0.2)
        if self.asyncio_loop is None:
             print("ERROR: Asyncio loop did not start correctly.")
             raise RuntimeError("Failed to initialize asyncio event loop.")
        else:
             print("Asyncio loop is running.")


    def _stop_asyncio_loop(self):
        """Stops the asyncio event loop and waits for the thread to join."""
        if self.asyncio_loop and self.asyncio_loop.is_running():
            print("Stopping asyncio loop...")
            self.asyncio_loop.call_soon_threadsafe(self.asyncio_loop.stop) # Request stop
        if self.asyncio_loop_thread and self.asyncio_loop_thread.is_alive():
            print("Waiting for asyncio loop thread to finish...")
            self.asyncio_loop_thread.join(timeout=5.0) # Wait up to 5 seconds
            if self.asyncio_loop_thread.is_alive():
                print("Warning: Asyncio loop thread did not stop cleanly.")
        self.asyncio_loop = None
        self.asyncio_loop_thread = None
        print("Asyncio loop stopped.")


    def _setup_hotkey_listener(self) -> None:
        """Registers the global hotkey listener."""
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

        print(f"[{timestamp}] Hotkey '{hotkey_name}' detected. Queuing context check & start command.")
        self.action_queue.put(_ACTION_TOGGLE_STREAMING) # Signal the main loop


    def _run_event_loop(self) -> None:
        """The main event loop, processing actions from the hotkey."""
        print("Entering main event loop. Waiting for hotkey...")
        try:
            while True:
                try:
                    action = self.action_queue.get(block=True, timeout=0.5) # Shorter timeout

                    if action == _ACTION_TOGGLE_STREAMING:
                        if not self.is_streaming:
                            # Check if already processing before allowing start
                            if self.is_processing:
                                print(f"[{time.strftime('%H:%M:%S')}] Cannot start streaming while processing previous command.")
                            else:
                                self._start_streaming_process()
                        else:
                            self._stop_streaming_process()
                    # Handle processing action triggered internally after transcript finalization
                    elif action == _ACTION_PROCESS_TRANSCRIPT:
                        # The actual transcript/context data should be handled by the
                        # method called by the transcript consumer. This action is now
                        # more of a placeholder or could be removed if direct calls work.
                        # Let's remove the placeholder print for now, processing will be
                        # initiated directly from the consumer or related method.
                        pass # Processing initiation moved elsewhere

                    else:
                        print(f"Warning: Unknown action received in queue: {action}")

                except queue.Empty:
                    # Check if asyncio loop is still running periodically
                    if self.asyncio_loop and not self.asyncio_loop.is_running():
                        print("Error: Asyncio loop stopped unexpectedly. Shutting down.")
                        break
                    pass # Normal timeout while waiting

        except KeyboardInterrupt:
            print("\nCtrl+C detected. Initiating shutdown...")
        except Exception as e:
            print(f"\nAn unexpected error occurred in the main loop: {e}")
            traceback.print_exc()


    async def _consume_transcripts(self):
        """Async task to consume transcripts from the queue and display them."""
        logger.info("Transcript consumer task started.")
        while True:
            try:
                # Store the queue reference locally for this iteration
                current_q = self.transcript_queue
                if not current_q:
                    logger.warning("Transcript queue became None during consumption loop iteration.")
                    break # Exit if queue is gone

                result = await current_q.get()
                if result is None: # End signal
                    logger.info("Received None from transcript queue. Exiting consumer task.")
                    break

                text = result.get("text", "")
                is_final = result.get("is_final", False)

                if is_final:
                    final_transcript = text.strip()
                    # Print final result on a new line, clearing the partial line first
                    print('\r' + ' ' * len(self._current_partial_transcript) + '\r') # Clear line
                    if final_transcript:
                        print(f"FINAL TRANSCRIPT: {final_transcript}")
                        self._current_partial_transcript = "" # Reset partial

                        # --- Stop Streaming and Start Processing ---
                        timestamp = time.strftime('%H:%M:%S')
                        print(f"[{timestamp}] Final transcript received. Stopping stream and initiating processing...")

                        # Directly stop the streaming process from the async task
                        # Note: This runs _stop_streaming_process in the asyncio event loop's thread
                        # Ensure _stop_streaming_process is safe to call like this (it seems mostly thread-safe)
                        # but be mindful of potential race conditions if it interacts heavily with other threads.
                        stop_stream_start_time = time.time() # Log start
                        print(f"[{time.strftime('%H:%M:%S')}] Calling _stop_streaming_process...")
                        self._stop_streaming_process() # Stop audio/Vosk
                        stop_stream_end_time = time.time() # Log end
                        stop_duration = stop_stream_end_time - stop_stream_start_time
                        print(f"[{time.strftime('%H:%M:%S')}] _stop_streaming_process finished (took {stop_duration:.3f}s).")

                        # Initiate LLM processing with the final transcript
                        print(f"[{time.strftime('%H:%M:%S')}] Calling _initiate_llm_processing...")
                        self._initiate_llm_processing(final_transcript)

                    else:
                        print(f"[{timestamp}] Final transcript was empty, skipping processing.")
                        self._current_partial_transcript = "" # Reset partial
                        # Ensure stream stops even if transcript is empty but final
                        self._stop_streaming_process()


                else:
                    # Update partial transcript, overwriting the current line
                    self._current_partial_transcript = text
                    print('\r' + text + ' ' * 20, end='', flush=True) # Use end and flush for better live update

                # Use the local reference to mark the task as done
                current_q.task_done()

            except asyncio.CancelledError:
                 logger.info("Transcript consumer task cancelled.")
                 # Clear the partial line on cancel
                 if self._current_partial_transcript:
                     print('\r' + ' ' * len(self._current_partial_transcript) + '\r')
                 break
            except Exception as e:
                 logger.error(f"Error in transcript consumer task: {e}", exc_info=True)
                 # Avoid breaking the loop on error, just log it
                 await asyncio.sleep(0.1)


    def _start_streaming_process(self) -> None:
        """Initiates audio capture, context fetching, and Vosk processing."""
        if self.is_streaming:
            print("Already streaming.")
            return

        if not self.asyncio_loop or not self.asyncio_loop.is_running():
             print("ERROR: Asyncio loop is not running. Cannot start streaming.")
             return

        timestamp = time.strftime('%H:%M:%S')
        print(f"[{timestamp}] --- Initiating Streaming (Vosk) ---")

        # --- Start Context Fetching ---
        # 1. Get current app context info
        print(f"[{timestamp}] Checking active window context...")
        active_window_info = platform_utils.get_active_window_info()
        if not active_window_info or not active_window_info.get("app_name"):
            print(f"[{timestamp}] Error: Could not determine active window. Cannot fetch context.")
            # Decide if we should proceed without context or abort
            # For now, we proceed but log the issue
            self.current_context_data['app_name'] = "Unknown"
            self.current_context_data['doc_text'] = None
        else:
            app_name = active_window_info.get("app_name", "Unknown")
            self.current_context_data['app_name'] = app_name
            self.current_context_data['doc_text'] = None # Clear previous context
            print(f"[{timestamp}] Active application: {app_name}")

            # 2. Define context fetching target function
            def fetch_context_target():
                fetch_start_time = time.time() # Add start time
                print(f"[{time.strftime('%H:%M:%S')}] Fetching context from '{app_name}' (in background)...")
                fetched_context = None
                try:
                    # Pass the current_context_data which now contains the app_name
                    context_call_start_time = time.time() # Add call start time
                    fetched_context = self.context_engine.get_context(self.current_context_data)
                    context_call_end_time = time.time() # Add call end time
                    call_duration = context_call_end_time - context_call_start_time
                    if fetched_context is None:
                        print(f"[{time.strftime('%H:%M:%S')}] Warning: Context engine returned None for '{app_name}' (call duration: {call_duration:.3f}s).")
                    else:
                        print(f"[{time.strftime('%H:%M:%S')}] Context retrieved successfully (call duration: {call_duration:.3f}s).")
                except Exception as e:
                    print(f"[{time.strftime('%H:%M:%S')}] Error fetching context for '{app_name}': {e}")
                finally:
                    # Store the result (even if None) back into current_context_data
                    # Ensure this update is thread-safe if needed, though assignment is often atomic
                    self.current_context_data['doc_text'] = fetched_context
                    fetch_end_time = time.time() # Add overall end time
                    fetch_duration = fetch_end_time - fetch_start_time
                    print(f"[{time.strftime('%H:%M:%S')}] Context fetch thread finished (total duration: {fetch_duration:.3f}s).")


            # 3. Start the context fetching thread
            self.context_fetch_thread_handle = threading.Thread(
                target=fetch_context_target,
                daemon=True,
                name="StreamingContextFetchThread"
            )
            self.context_fetch_thread_handle.start()
            print(f"[{timestamp}] Context fetch thread started.")
        # --- End Context Fetching ---


        self.is_streaming = True
        self._current_partial_transcript = "" # Reset display

        # Create Asyncio Queues
        self.audio_stream_queue = asyncio.Queue(maxsize=200) # Audio Capture -> Vosk Processor
        self.transcript_queue = asyncio.Queue(maxsize=100) # Vosk Processor -> Transcript Consumer

        # 2. Start Audio Capture Thread (make sure it sends bytes)
        self.stop_audio_capture_event.clear()
        self.audio_capture_thread_handle = threading.Thread(
            target=self.audio_handler.stream_audio_to_async_queue,
            # Ensure the audio handler sends raw bytes compatible with Vosk
            args=(self.stop_audio_capture_event, self.audio_stream_queue, self.asyncio_loop, 'bytes'), # Specify output_format='bytes'
            daemon=True,
            name="AudioCaptureThread"
        )
        self.audio_capture_thread_handle.start()
        print(f"[{timestamp}] Audio capture thread started (outputting bytes).")

        # 3. Create and Start Vosk Processor
        try:
            self.vosk_processor = VoskProcessor(
                model_path=self.vosk_model_path,
                sample_rate=self.audio_handler.sample_rate,
                audio_input_queue=self.audio_stream_queue,
                transcript_output_queue=self.transcript_queue,
                loop=self.asyncio_loop
            )
            self.vosk_processor.start() # Starts the background thread
            print(f"[{timestamp}] Vosk processor started.")
        except Exception as e:
            print(f"[{timestamp}] ERROR initializing or starting Vosk processor: {e}")
            traceback.print_exc()
            # Cleanup if Vosk failed
            self.stop_audio_capture_event.set()
            if self.audio_capture_thread_handle: self.audio_capture_thread_handle.join(timeout=1.0)
            self.is_streaming = False
            self.audio_stream_queue = None
            self.transcript_queue = None
            return

        # 4. Start Transcript Consumer Task in Asyncio Loop
        self._transcript_consumer_task = asyncio.run_coroutine_threadsafe(
            self._consume_transcripts(),
            self.asyncio_loop
        )
        print(f"[{timestamp}] Transcript consumer task started.")

        print(f"[{timestamp}] Streaming started. Press '{self.config.start_recording_hotkey}' again to stop.")


    def _stop_streaming_process(self) -> None:
        """Stops audio capture and Vosk processing."""
        if not self.is_streaming:
            print("Not currently streaming.")
            return

        timestamp = time.strftime('%H:%M:%S')
        print(f"[{timestamp}] --- Stopping Streaming (Vosk) ---")
        self.is_streaming = False

        # 1. Stop Vosk Processor Thread (signals queue with None)
        if self.vosk_processor:
            print(f"[{timestamp}] Stopping Vosk processor...")
            self.vosk_processor.stop() # This also puts None in audio_stream_queue
            self.vosk_processor = None
            print(f"[{timestamp}] Vosk processor stopped.")
        else:
             # If Vosk wasn't running, still need to signal audio queue potentially
             if self.audio_stream_queue and self.asyncio_loop and self.asyncio_loop.is_running():
                  asyncio.run_coroutine_threadsafe(self.audio_stream_queue.put(None), self.asyncio_loop)


        # 2. Stop Audio Capture Thread
        # Vosk's stop already signaled the queue, but set event just in case
        self.stop_audio_capture_event.set()
        if self.audio_capture_thread_handle and self.audio_capture_thread_handle.is_alive():
             print(f"[{timestamp}] Waiting for audio capture thread to finish...")
             self.audio_capture_thread_handle.join(timeout=2.0)
             if self.audio_capture_thread_handle.is_alive():
                  print(f"[{timestamp}] Warning: Audio capture thread did not exit cleanly.")
        self.audio_capture_thread_handle = None
        print(f"[{timestamp}] Audio capture stopped.")

        # 3. Stop Transcript Consumer Task
        if self._transcript_consumer_task and not self._transcript_consumer_task.done():
             print(f"[{timestamp}] Stopping transcript consumer task...")
             # Signal consumer task to stop by putting None in its queue
             if self.transcript_queue and self.asyncio_loop and self.asyncio_loop.is_running():
                 asyncio.run_coroutine_threadsafe(self.transcript_queue.put(None), self.asyncio_loop)
                 print(f"[{timestamp}] Signaled transcript consumer task with None.")
             else:
                 print(f"[{timestamp}] Transcript queue or asyncio loop not available to signal consumer task.")

             # Cancel the task directly instead of waiting with result()
             # The task's CancelledError handler will manage cleanup.
             print(f"[{timestamp}] Cancelling transcript consumer task...")
             cancelled_correctly = self._transcript_consumer_task.cancel()
             if cancelled_correctly:
                  print(f"[{timestamp}] Transcript consumer task cancellation requested.")
             else:
                  print(f"[{timestamp}] Transcript consumer task could not be cancelled (might be already done).")

        # Clear the task reference regardless
        self._transcript_consumer_task = None


        # 4. Clear queues
        self.audio_stream_queue = None
        self.transcript_queue = None

        # Ensure the final partial line is cleared from console
        if self._current_partial_transcript:
            print('\r' + ' ' * len(self._current_partial_transcript) + '\r')
            self._current_partial_transcript = ""


        print(f"[{timestamp}] Streaming stopped.")

    # --- LLM Processing Logic ---

    def _initiate_llm_processing(self, final_transcript: str) -> None:
        """Checks state, waits for context, and starts the LLM processing thread."""
        timestamp = time.strftime('%H:%M:%S')
        print(f"[{timestamp}] Initiating LLM processing for: '{final_transcript}'")

        # Check processing lock *before* waiting for context or starting thread
        if self.processing_lock.locked():
            print(f"[{timestamp}] Processing lock is held. Skipping new processing request.")
            return

        # Wait for the context fetching thread to finish (if it's running)
        if self.context_fetch_thread_handle and self.context_fetch_thread_handle.is_alive():
            wait_start_time = time.time() # Log wait start
            print(f"[{time.strftime('%H:%M:%S')}] Waiting for context fetch thread to complete...")
            self.context_fetch_thread_handle.join(timeout=5.0) # Add a timeout
            wait_end_time = time.time() # Log wait end
            wait_duration = wait_end_time - wait_start_time
            if self.context_fetch_thread_handle.is_alive():
                print(f"[{time.strftime('%H:%M:%S')}] Warning: Context fetch thread did not complete within timeout ({wait_duration:.3f}s wait).")
                # Decide how to handle this - process without context? Abort?
                # For now, let's proceed but context might be None or incomplete.
            else:
                print(f"[{time.strftime('%H:%M:%S')}] Context fetch thread joined ({wait_duration:.3f}s wait).")
        self.context_fetch_thread_handle = None # Clear the handle

        # Context should now be available in self.current_context_data['doc_text']
        # Retrieve it (it might be None if fetching failed or timed out)
        retrieved_doc_context = self.current_context_data.get('doc_text')

        # Start the actual processing in a separate thread
        print(f"[{timestamp}] Starting LLM processing thread...")
        self.processing_thread_handle = threading.Thread(
            target=self._llm_processing_thread_target,
            args=(final_transcript, retrieved_doc_context),
            daemon=True,
            name="LLMProcessingThread"
        )
        self.processing_thread_handle.start()

    def _llm_processing_thread_target(self, final_transcript: str, original_doc_context: Optional[str]) -> None:
        """Thread target for executing the processing pipeline via ProcessingEngine."""
        timestamp = time.strftime('%H:%M:%S')

        # Acquire lock and set processing state
        if not self.processing_lock.acquire(blocking=False):
             print(f"[{timestamp}] Error (Processing Thread): Could not acquire processing lock. Aborting.")
             return

        self.is_processing = True
        print(f"[{timestamp}] --- Starting LLM Processing Pipeline ---")
        print(f"[{timestamp}] Context App: {self.current_context_data.get('app_name', 'N/A')}")
        # print(f"[{timestamp}] Context Text (Preview): {original_doc_context[:100] + '... ' if original_doc_context else 'None'}")
        print(f"[{timestamp}] User Command (from stream): '{final_transcript}'")

        # Clear the stored context text after retrieving it for this run
        # Prevents accidental reuse if context fetching fails next time
        self.current_context_data['doc_text'] = None

        try:
            # Call the main processing logic in the ProcessingEngine
            self.processing_engine.process(
                current_context=self.current_context_data, # Pass the dict (contains app_name)
                processing_text=original_doc_context,      # Pass the fetched text separately
                user_command=final_transcript
            )
            print(f"[{timestamp}] Processing engine finished successfully.")

        except Exception as e:
            print(f"[{timestamp}] Error during processing pipeline execution: {e}")
            traceback.print_exc()
        finally:
            # Crucial Cleanup for this thread
            self.is_processing = False
            self.processing_lock.release()
            print(f"[{timestamp}] --- LLM Processing Pipeline Finished ---")
            print(f"[{timestamp}] Ready for next command (streaming or discrete).")
            # Optionally, update UI status queue if you integrate one later
            # if self.status_queue:
            #     self.status_queue.put("Ready")

    def _process_transcript(self) -> None:
        """
        Processes a transcript.
        This method is called when the _ACTION_PROCESS_TRANSCRIPT action is received.
        """
        # Implementation of _process_transcript method
        pass

    def _cleanup(self) -> None:
        """Performs cleanup operations when the application is shutting down."""
        print("Initiating cleanup...")
        # 1. Stop streaming if active
        if self.is_streaming:
            print("Streaming is active during shutdown, stopping it first.")
            self._stop_streaming_process()

        # 2. Stop hotkey listener (ensure this works with pynput)
        if self.hotkey_listener:
            print("Stopping hotkey listener...")
            try:
                # For pynput Listener, call stop()
                self.hotkey_listener.stop()
                # Join the listener thread? pynput might manage this. Check docs.
                # self.hotkey_listener.join() # If needed
                print("Hotkey listener stopped.")
            except Exception as e:
                print(f"Error stopping pynput listener: {e}")
            self.hotkey_listener = None

        # 3. Stop asyncio loop
        self._stop_asyncio_loop() # Should handle joining its thread

        # 4. Final checks (threads should be joined by stop methods)
        # Wait for context fetch thread if it was somehow still running
        if self.context_fetch_thread_handle and self.context_fetch_thread_handle.is_alive():
            print("Waiting for context fetch thread during final cleanup...")
            self.context_fetch_thread_handle.join(timeout=1.0)
            if self.context_fetch_thread_handle.is_alive():
                print("Warning: Context fetch thread still alive during final cleanup.")

        if self.audio_capture_thread_handle and self.audio_capture_thread_handle.is_alive():
             print("Warning: Audio capture thread still alive during final cleanup.")
         # Vosk processor thread should be joined in _stop_streaming_process or _cleanup->stop_streaming

        # Wait for processing thread if it was running
        if self.processing_thread_handle and self.processing_thread_handle.is_alive():
            print("Waiting for processing thread during final cleanup...")
            # Note: We don't signal this thread directly to stop, but it should finish
            # on its own. Joining ensures we wait for file operations etc.
            self.processing_thread_handle.join(timeout=5.0) # Allow more time for LLM/processing
            if self.processing_thread_handle.is_alive():
                print("Warning: Processing thread still alive during final cleanup.")

        # Release processing lock if held (shouldn't be, but for safety)
        if self.processing_lock.locked():
            print("Releasing processing lock during final cleanup...")
            self.processing_lock.release()

        print("Cleanup sequence complete.")


# --- Helper for logging within application ---
logger = logging.getLogger("StreamingApp")
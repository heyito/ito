import queue
import threading
import time
import traceback
import asyncio # Added
from typing import Any, Dict, List, Optional, Union

from pynput import keyboard
import numpy as np
from src.app_config import AppConfig
from src.application_interface import ApplicationInterface
# --- Removed ContextEngine, ProcessingEngine, LLMHandler imports (as they are tied to discrete mode)
# from src.engines.context_engine import ContextEngine
# from src.engines.processing_engine import ProcessingEngine
# from src.handlers.llm_handler import LLMHandler
# --- Removed StreamingAudioInterface (using OpenAIWebRTCClient directly now)
# from src.handlers.streaming_audio_interface import StreamingAudioInterface
from src.handlers.audio_handler import AudioHandler
from src.clients.openai_client import OpenAIWebRTCClient # Import the WebRTC client
from src import platform_utils_macos as platform_utils # Keep for platform utils if needed

# Actions for the queue (can be simplified)
_ACTION_TOGGLE_STREAMING = "TOGGLE_STREAMING"

class StreamingAudioApplication(ApplicationInterface):
    def __init__(self, audio_handler: AudioHandler, raw_config: Dict[str, Any]):
        """
        Initializes the streaming audio application.

        Args:
            audio_handler: Instance of AudioHandler for capturing audio.
            raw_config: Dictionary containing application configuration.
        """
        self.config: AppConfig = AppConfig(raw_config)
        self.audio_handler: AudioHandler = audio_handler
        # --- Removed engines and LLM handler ---
        # self.context_engine: ContextEngine = context_engine
        # self.processing_engine: ProcessingEngine = processing_engine
        # self.llm_handler: LLMHandler = llm_handler

        # --- State Flags ---
        self.is_streaming: bool = False
        self.stop_audio_capture_event = threading.Event() # Event to signal audio capture thread

        # --- Threading & Asyncio ---
        self.action_queue = queue.Queue() # For triggering actions from hotkey thread
        self.hotkey_listener = None # keyboard or pynput listener
        self.audio_capture_thread_handle: Optional[threading.Thread] = None

        self.asyncio_loop: Optional[asyncio.AbstractEventLoop] = None
        self.asyncio_loop_thread: Optional[threading.Thread] = None
        self.webrtc_client: Optional[OpenAIWebRTCClient] = None
        self.audio_stream_queue: Optional[asyncio.Queue] = None # Queue for audio -> WebRTC client

        # --- Current Context (Simplified for streaming example) ---
        self.current_context_data: Dict[str, Any] = {"app_name": None} # Basic context

        self.raw_config = raw_config

        print("StreamingAudioApplication Initialized")


    def run(self) -> None:
        """
        Starts the application, sets up listeners, and enters the main event loop.
        """
        self._print_initial_info()
        try:
            self._setup_hotkey_listener()
            # Start the asyncio loop thread immediately
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
                    action = self.action_queue.get(block=True, timeout=1.0)

                    if action == _ACTION_TOGGLE_STREAMING:
                        if not self.is_streaming:
                            self._start_streaming_process()
                        else:
                            self._stop_streaming_process()
                    else:
                        print(f"Warning: Unknown action received in queue: {action}")

                except queue.Empty:
                    # Normal timeout while waiting
                    pass
                except Exception as e:
                    print(f"\nError in event loop action processing: {e}")
                    traceback.print_exc()

        except KeyboardInterrupt:
            print("\nCtrl+C detected. Initiating shutdown...")
        except Exception as e:
            print(f"\nAn unexpected error occurred in the main loop: {e}")
            traceback.print_exc()

    def _start_streaming_process(self) -> None:
        """Initiates the audio streaming and WebRTC connection."""
        if self.is_streaming:
            print("Already streaming.")
            return

        if not self.asyncio_loop or not self.asyncio_loop.is_running():
             print("ERROR: Asyncio loop is not running. Cannot start streaming.")
             # Attempt to restart loop? Or just fail.
             # self._start_asyncio_loop() # Be careful with restarting
             return

        timestamp = time.strftime('%H:%M:%S')
        print(f"[{timestamp}] --- Initiating Streaming ---")
        self.is_streaming = True # Set state early

        # 1. Create Asyncio Queue for audio data
        self.audio_stream_queue = asyncio.Queue(maxsize=200) # Increase queue size from 50 to 200

        # 2. Start Audio Capture Thread
        self.stop_audio_capture_event.clear()
        self.audio_capture_thread_handle = threading.Thread(
            target=self.audio_handler.stream_audio_to_async_queue,
            args=(self.stop_audio_capture_event, self.audio_stream_queue, self.asyncio_loop),
            daemon=True,
            name="AudioCaptureThread"
        )
        self.audio_capture_thread_handle.start()
        print(f"[{timestamp}] Audio capture thread started.")

        # 3. Create and Connect WebRTC Client (in asyncio loop)
        # --- Get API key directly from raw_config --- 
        openai_config = self.raw_config.get('OpenAI', {}) # Get OpenAI section, default to empty dict
        api_key = openai_config.get('api_key') # Get the api_key from the section

        if not api_key:
             print(f"[{timestamp}] ERROR: OpenAI API key not found in configuration under [OpenAI] section.")
             self.is_streaming = False # Revert state
             # Signal audio thread to stop if it started
             self.stop_audio_capture_event.set()
             return

        # Define the callback for handling transcripts within the asyncio loop
        async def async_transcription_handler(data):
             # Process the transcript data (this runs in the asyncio loop)
             # print(f"RAW DATA: {data}") # Debug: print raw data
             text = data.get("text", "")
             if text:
                  print(f"TRANSCRIPT: {text}", flush=True) # Use flush for immediate output
             # Handle other potential fields like 'start', 'end', 'confidence' if provided

        # Create client instance - ensure this is done correctly thread-safe if needed
        # Since it's called from main thread, just create it. Methods will be called via run_coroutine_threadsafe.
        self.webrtc_client = OpenAIWebRTCClient(
             api_key=api_key,
             on_transcription_received=async_transcription_handler # Pass the async handler
        )


        # Schedule the connect coroutine in the asyncio loop
        async def connect_task():
            try:
                print(f"[{timestamp}] Attempting WebRTC connection...")
                await self.webrtc_client.connect(
                    audio_queue=self.audio_stream_queue,
                    sample_rate=self.audio_handler.sample_rate,
                    channels=self.audio_handler.channels
                )
                print(f"[{timestamp}] WebRTC connection successful (state: {self.webrtc_client.pc.connectionState}).")
            except Exception as e:
                print(f"[{timestamp}] ERROR during WebRTC connection: {e}")
                traceback.print_exc()
                # If connection fails, trigger stop process from within the loop
                # Need to call the sync stop method thread-safely
                self.asyncio_loop.call_soon_threadsafe(self._trigger_stop_from_async_error)

        # Run the connect coroutine in the asyncio loop thread
        asyncio.run_coroutine_threadsafe(connect_task(), self.asyncio_loop)

        # Optional: Wait briefly for connection attempt or handle result later
        try:
            # connect_future.result(timeout=1) # Check for immediate errors
            pass # Or just let it run asynchronously
        except Exception as e:
            print(f"[{timestamp}] Error scheduling connect task: {e}")
            # Trigger stop if scheduling failed
            self._stop_streaming_process() # Call the sync stop method

        print(f"[{timestamp}] Streaming started. Press '{self.config.start_recording_hotkey}' again to stop.")


    def _trigger_stop_from_async_error(self):
        """Helper to call stop from the asyncio loop when an error occurs there."""
        print("Connection error detected in async task, triggering stop process.")
        # Check if we are still in streaming state before stopping
        if self.is_streaming:
             # Queue the stop action for the main thread to handle cleanly
             self.action_queue.put(_ACTION_TOGGLE_STREAMING) # Main thread will see is_streaming=True and stop


    def _stop_streaming_process(self) -> None:
        """Stops the audio streaming and closes the WebRTC connection."""
        if not self.is_streaming:
            print("Not currently streaming.")
            return

        timestamp = time.strftime('%H:%M:%S')
        print(f"[{timestamp}] --- Stopping Streaming ---")
        self.is_streaming = False # Set state early

        # 1. Signal Audio Capture Thread to Stop
        self.stop_audio_capture_event.set()
        print(f"[{timestamp}] Stop event set for audio capture.")

        # 2. Close WebRTC Client (in asyncio loop)
        if self.webrtc_client and self.asyncio_loop and self.asyncio_loop.is_running():
             async def close_task():
                 try:
                      print(f"[{timestamp}] Closing WebRTC client...")
                      await self.webrtc_client.close()
                      print(f"[{timestamp}] WebRTC client closed.")
                 except Exception as e:
                      print(f"[{timestamp}] ERROR during WebRTC client close: {e}")
                 finally:
                      self.webrtc_client = None # Clear reference

             close_future = asyncio.run_coroutine_threadsafe(close_task(), self.asyncio_loop)
             # Wait for close to complete? Important for clean shutdown.
             try:
                 close_future.result(timeout=5.0) # Wait up to 5 seconds for close
             except TimeoutError:
                 print(f"[{timestamp}] Timeout waiting for WebRTC client to close.")
             except Exception as e:
                 print(f"[{timestamp}] Error waiting for WebRTC close future: {e}")
        else:
             print(f"[{timestamp}] WebRTC client or asyncio loop not available for closing.")


        # 3. Wait for Audio Capture Thread to Join
        if self.audio_capture_thread_handle and self.audio_capture_thread_handle.is_alive():
             print(f"[{timestamp}] Waiting for audio capture thread to finish...")
             self.audio_capture_thread_handle.join(timeout=2.0) # Wait max 2 seconds
             if self.audio_capture_thread_handle.is_alive():
                  print(f"[{timestamp}] Warning: Audio capture thread did not exit cleanly.")
        self.audio_capture_thread_handle = None

        # 4. Clear the queue (safety measure)
        self.audio_stream_queue = None # Allow garbage collection

        print(f"[{timestamp}] Streaming stopped.")


    def _cleanup(self) -> None:
        """Performs cleanup operations when the application is shutting down."""
        print("Initiating cleanup...")

        # 1. Stop streaming if it's active
        if self.is_streaming:
            print("Streaming is active during shutdown, stopping it first.")
            self._stop_streaming_process()

        # 2. Stop the hotkey listener
        if self.hotkey_listener:
            print("Removing hotkey listener...")
            try:
                # How to remove depends on the library used
                # For 'keyboard':
                keyboard.remove_hotkey(self.hotkey_listener)
                print(f"Hotkey '{self.hotkey_listener}' removed.")
            except Exception as e:
                print(f"Error removing hotkey listener: {e}")
            self.hotkey_listener = None

        # 3. Stop the asyncio loop thread
        self._stop_asyncio_loop()

        # 4. Final cleanup checks
        # Ensure threads are joined if joinable and alive
        if self.audio_capture_thread_handle and self.audio_capture_thread_handle.is_alive():
             print("Warning: Audio capture thread still alive during final cleanup.")
        if self.asyncio_loop_thread and self.asyncio_loop_thread.is_alive():
             print("Warning: Asyncio loop thread still alive during final cleanup.")


        print("Cleanup sequence complete.")
# src/streaming_application_runner.py
import asyncio
import queue
import threading
import time
import logging # Use logging specific to streaming
from typing import Optional, Dict, Any, Type

from src.app_config import AppConfig
from src.application_interface import ApplicationInterface
from src.context_manager import ContextManager
from src.command_processor import CommandProcessor
from src.handlers.audio.audio_streamer import AudioStreamer

logger = logging.getLogger("StreamingRunner")

class StreamingApplicationRunner(ApplicationInterface):
    """Orchestrates the streaming workflow using composed components."""

    def __init__(self,
                 config: AppConfig,
                 context_manager: ContextManager,
                 command_processor: CommandProcessor,
                 audio_streamer: AudioStreamer, # Expecting configured instance
                 status_queue: Optional[queue.Queue]):

        self.config = config
        self.context_manager = context_manager
        self.command_processor = command_processor
        self.audio_streamer = audio_streamer
        self.status_queue = status_queue

        self._action_queue = queue.Queue()
        self._stop_event = threading.Event() # For the main runner loop
        self._asyncio_loop = audio_streamer.loop # Get loop from streamer
        self._transcript_consumer_task: Optional[asyncio.Task] = None
        self._current_partial_transcript: str = ""

        self._print_initial_info()


    def _print_initial_info(self):
        timestamp = time.strftime('%Y-%m-%d %H:%M:%S')
        print(f"\n--- Inten Tool (Streaming Mode) ---")
        print(f"Timestamp: {timestamp}")
        # Add platform warning if needed
        # ASR info should come from the specific ASR processor config if needed
        print("Inten background process running...")

    def trigger_interaction(self) -> None:
        """Queues the toggle action if preconditions met."""
        timestamp = time.strftime('%H:%M:%S')
        # Prevent toggling if a command *processing* is happening
        if self.command_processor.is_processing:
            print(f"[{timestamp}] Trigger ignored: Command processor busy.")
            self._update_status("Processing busy, cannot toggle stream")
            return

        print(f"[{timestamp}] Trigger received. Queuing toggle action.")
        self._action_queue.put("TOGGLE")
        next_state = "Stopping" if self.audio_streamer.is_streaming else "Starting"
        self._update_status(f"Hotkey pressed, {next_state} stream...")

    def run(self) -> None:
        """Main event loop processing toggle actions."""
        print("Streaming Runner: Starting event loop...")
        if not self._asyncio_loop or not self._asyncio_loop.is_running():
             logger.error("Streaming Runner: Asyncio loop provided by AudioStreamer is not running!")
             return # Cannot run

        while not self._stop_event.is_set():
            try:
                action = self._action_queue.get(timeout=0.5)
                if action == "TOGGLE":
                    self._handle_toggle()
            except queue.Empty:
                # Periodically check if asyncio loop died (shouldn't happen if managed externally)
                if not self._asyncio_loop.is_running():
                    logger.error("Streaming Runner: Asyncio loop stopped unexpectedly!")
                    self._update_status("Error: Asyncio loop failed")
                    break # Exit runner loop
                continue # Check stop event
            except Exception as e:
                logger.error(f"Streaming Runner Error: {e}", exc_info=True)
        print("Streaming Runner: Event loop stopped.")

    def _handle_toggle(self):
        """Starts or stops the streaming process."""
        timestamp = time.strftime('%H:%M:%S')
        if self.audio_streamer.is_streaming:
            print(f"[{timestamp}] Streaming Runner: Stopping stream...")
            # Stop consumer task first
            if self._transcript_consumer_task and not self._transcript_consumer_task.done():
                self._transcript_consumer_task.cancel()
                # Optionally wait for cancellation if needed? Usually not required.
            self._transcript_consumer_task = None
            # Stop audio streamer (stops capture and ASR processor)
            self.audio_streamer.stop_streaming()
            self._update_status("Ready")
        else:
             # Don't start if command processor is busy (checked in trigger, but double-check)
             if self.command_processor.is_processing:
                 print(f"[{timestamp}] Streaming Runner: Cannot start, processor busy.")
                 return

             print(f"[{timestamp}] Streaming Runner: Starting stream...")
             self.context_manager.fetch_context_async() # Start context fetch
             # Start audio streamer (starts capture, ASR)
             if self.audio_streamer.start_streaming():
                 # Start transcript consumer task *after* streamer confirms start
                 if self.audio_streamer.transcript_queue:
                     self._transcript_consumer_task = asyncio.run_coroutine_threadsafe(
                         self._consume_transcripts(self.audio_streamer.transcript_queue),
                         self._asyncio_loop
                     )
                     self._update_status("Streaming active...")
                 else:
                     logger.error("AudioStreamer started but transcript_queue is missing!")
                     self.audio_streamer.stop_streaming() # Stop if setup failed
                     self._update_status("Error starting stream")
             else:
                 logger.error("Failed to start audio streamer.")
                 self._update_status("Error starting stream")


    async def _consume_transcripts(self, transcript_queue: asyncio.Queue):
        """Async task to consume transcripts and trigger processing."""
        logger.info("Transcript consumer task started.")
        while True:
            try:
                result = await transcript_queue.get()
                if result is None: break # Signal to exit

                text = result.get("text", "")
                is_final = result.get("is_final", False)

                if is_final:
                    final_transcript = text.strip()
                    print('\r' + ' ' * len(self._current_partial_transcript) + '\r', end='') # Clear line
                    if final_transcript:
                        print(f"FINAL TRANSCRIPT: {final_transcript}")
                        self._update_status("Final transcript received...")

                        # --- Trigger processing logic ---
                        # 1. Stop Streaming (via main thread queue?) - Simpler: Call stop directly if safe
                        logger.info("Stopping stream components after final transcript...")
                        self.audio_streamer.stop_streaming() # Ensure this is thread-safe or called appropriately
                        # Clear consumer task reference *after* stopping streamer
                        self._transcript_consumer_task = None

                        # 2. Wait for Context
                        logger.info("Waiting for context...")
                        context_doc_text = self.context_manager.wait_for_context(timeout=5.0)
                        current_context_data = self.context_manager.get_current_context()
                        logger.info(f"Context ready (App: {current_context_data.get('app_name')}).")

                        # 3. Process Command
                        logger.info("Initiating command processing...")
                        self.command_processor.process_command(current_context_data, final_transcript)
                        # Processing now happens, status updates handled by CommandProcessor

                        # Since processing started, break the consumer loop.
                        # It will be restarted on the next stream start.
                        break

                    else:
                        print("FINAL TRANSCRIPT: (empty)")
                    self._current_partial_transcript = ""
                else: # Partial
                    self._current_partial_transcript = text
                    print('\r' + text + ' ' * 10, end='', flush=True)

                transcript_queue.task_done()

            except asyncio.CancelledError:
                 logger.info("Transcript consumer task cancelled.")
                 if self._current_partial_transcript: print('\r' + ' ' * len(self._current_partial_transcript) + '\r', end='')
                 break
            except Exception as e:
                 logger.error(f"Error in transcript consumer: {e}", exc_info=True)
                 self._update_status(f"Transcript Error: {e}")
                 await asyncio.sleep(0.1) # Prevent tight loop on error


    def _update_status(self, message: str):
        if self.status_queue:
            try: self.status_queue.put_nowait(message)
            except Exception: pass

    def cleanup(self) -> None:
        """Cleans up streaming components."""
        print("Streaming Runner: Cleaning up...")
        self._stop_event.set() # Signal event loop

        # Cancel consumer task if running
        if self._transcript_consumer_task and not self._transcript_consumer_task.done():
             print("Streaming Runner: Cancelling transcript consumer task...")
             self._transcript_consumer_task.cancel()

        # Cleanup components
        self.audio_streamer.cleanup() # Stops ASR processor and audio capture
        self.command_processor.cleanup()
        self.context_manager.cleanup()

        # Clear action queue
        while not self._action_queue.empty():
             try: self._action_queue.get_nowait()
             except queue.Empty: break

        # Note: Asyncio loop cleanup should be handled externally where it's created/managed
        # (e.g., potentially in ApplicationManager if it creates it, or let AudioStreamer manage it)
        # Let's assume AudioStreamer requires a running loop passed to it.

        print("Streaming Runner: Cleanup finished.")
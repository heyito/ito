import logging
import queue
import threading
import time
import traceback

from src.app_config import AppConfig
from src.application_interface import ApplicationInterface
from src.audio.asr_handler_interface import ASRHandlerInterface
from src.audio.audio_recorder import AudioRecorder
from src.command_processor import CommandProcessor
from src.context_manager import ContextManager
from src.types.actions import ApplicationAction
from src.types.modes import CommandMode
from src.types.status_messages import StatusMessage
from src.utils.timing import time_method

# Configure logging
logger = logging.getLogger(__name__)

class DiscreteApplicationRunner(ApplicationInterface):
    """Orchestrates the discrete command workflow using composed components."""

    def __init__(
        self,
        config: AppConfig,
        context_manager: ContextManager,
        command_processor: CommandProcessor,
        audio_recorder: AudioRecorder,
        asr_handler: ASRHandlerInterface,
        status_queue: queue.Queue | None,
    ):
        self.config = config
        self.context_manager = context_manager
        self.command_processor = command_processor
        self.audio_recorder = audio_recorder
        self.asr_handler = asr_handler
        self.status_queue = status_queue

        self._mode = CommandMode.default_mode
        self._action_queue: queue.Queue[ApplicationAction] = queue.Queue()
        self._stop_event = threading.Event()
        self._monitor_thread: threading.Thread | None = (
            None  # Monitor coordination thread
        )

        self._print_initial_info()

    def _print_initial_info(self):
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        logger.info("\n--- Ito Tool (Discrete Command Mode) ---")
        logger.info(f"Timestamp: {timestamp}")
        # Add platform warning if needed
        logger.info(
            f"ASR Source: {self.config.asr_source} ({self.config.asr_model or self.config.asr_local_model_size})"
        )
        logger.info(f"\nPress '{self.config.dictation_hotkey}' to issue command.")
        logger.info("Ito background process running...")

    @time_method
    def trigger_interaction(self, mode: CommandMode, start_time: float = None):
        """Trigger an interaction with the application."""
        now = time.time()
        elapsed = now - start_time if start_time else 0.0
        logger.info(f"[TIMING] trigger_interaction called at {now} with mode {mode} (elapsed: {elapsed:.3f}s)")
        logger.info(f"Triggering interaction with mode: {mode}...")
        if self.command_processor.is_processing:
            logger.info("Trigger ignored: Command processor busy.")
            self._update_status(StatusMessage.PROCESSING_BUSY)
            return
        if self.audio_recorder.is_recording:
            logger.info("Trigger ignored: Already recording.")
            self._update_status(StatusMessage.ALREADY_RECORDING)
            return

        logger.info("Trigger received. Queuing start action.")
        self._action_queue.put((ApplicationAction.START, start_time))
        self._mode = mode
        self._update_status(StatusMessage.HOTKEY_PRESSED)

    def stop_interaction(self):
        self._action_queue.put(ApplicationAction.STOP)

    def run(self) -> None:
        """Main event loop processing actions."""
        logger.info("Discrete Runner: Starting event loop...")
        while not self._stop_event.is_set():
            try:
                action_tuple = self._action_queue.get(timeout=0.5)
                if isinstance(action_tuple, tuple):
                    action, start_time = action_tuple
                else:
                    action, start_time = action_tuple, None
                if action == ApplicationAction.START:
                    self._handle_start_recording(start_time)
                elif action == ApplicationAction.STOP:
                    self._handle_stop_recording()
                else:
                    logger.warning(f"Unknown action: {action}")
            except queue.Empty:
                continue  # Check stop event
            except Exception as e:
                logger.error(f"Discrete Runner Error: {e}")
                traceback.print_exc()
        logger.info("Discrete Runner: Event loop stopped.")

    def _handle_start_recording(self, start_time: float = None):
        """Initiates context fetch and audio recording."""
        now = time.time()
        elapsed = now - start_time if start_time else 0.0
        logger.info(f"[TIMING] _handle_start_recording called at {now} (elapsed: {elapsed:.3f}s)")
        logger.info(f"[{now}] Discrete Runner: Handling start action...")

        # Start context fetch (non-blocking)
        self.context_manager.fetch_context_async(mode=self._mode)

        # Start audio recording (non-blocking), provide callback
        if not self.audio_recorder.start_recording(self._process_recorded_audio, start_time=start_time):
            logger.error(
                f"[{now}] Discrete Runner: Failed to start audio recorder. (elapsed: {elapsed:.3f}s)"
            )
            # Reset state? AudioRecorder might already be recording from previous failed trigger.

    def _handle_stop_recording(self):
        """Stops the audio recording and processes the recorded audio."""
        timestamp = time.strftime("%H:%M:%S")
        logger.info(f"[{timestamp}] Discrete Runner: Handling stop action...")

        # Stop audio recording
        self.audio_recorder.stop_recording()

    def _process_recorded_audio(self, audio_buffer: bytes | None):
        """
        Callback function passed to AudioRecorder.
        Executed by AudioRecorder's monitor thread.
        Handles transcription, context waiting, and command processing.
        """
        logger.info("Discrete Runner: Received audio buffer from recorder.")

        # Type-agnostic empty check
        is_empty = False
        if audio_buffer is None:
            is_empty = True
        elif isinstance(audio_buffer, bytes):
            is_empty = len(audio_buffer) == 0
        elif hasattr(audio_buffer, 'getbuffer'):
            is_empty = audio_buffer.getbuffer().nbytes == 0
        if is_empty:
            logger.warning("Discrete Runner: No valid audio buffer received (None or empty). Aborting.")
            # Status updated by AudioRecorder
            return

        # --- Transcribe ---
        logger.info("Discrete Runner: Transcribing...")
        self._update_status(StatusMessage.TRANSCRIBING)
        user_text_command: str | None = None
        try:
            user_text_command = self.asr_handler.transcribe_audio(audio_buffer)
            if not user_text_command or not user_text_command.strip():
                logger.warning("Discrete Runner: Transcription empty.")
                raise ValueError("Transcription empty")
            logger.info(f"Discrete Runner: Transcribed: '{user_text_command}'")
            self._update_status(
                StatusMessage.TRANSCRIBED.format(text=user_text_command[:40])
            )
        except Exception as e:
            logger.error(f"Discrete Runner: ASR Error: {e}")
            traceback.print_exc()
            self._update_status(StatusMessage.ERROR.format(error=str(e)))
            return

        # --- Wait for Context ---
        logger.info("Discrete Runner: Waiting for context...")
        self.context_manager.wait_for_context(timeout=5.0)
        # Get the full context dict (app_name + doc_text)
        current_context_data = self.context_manager.get_current_context()
        logger.info(
            f"Discrete Runner: Context ready (App: {current_context_data.get('app_name')})."
        )

        # --- Process Command ---
        logger.info("Discrete Runner: Initiating command processing...")
        # CommandProcessor handles the processing lock and thread internally
        self.command_processor.process_command(
            current_context_data, user_text_command, mode=self._mode
        )

    def _update_status(self, status: StatusMessage | str):
        """Update status, handling both enum values and custom messages."""
        if self.status_queue:
            try:
                if isinstance(status, StatusMessage):
                    # If it's a StatusMessage enum, use its value directly
                    self.status_queue.put_nowait(status.value)
                else:
                    # Try to match custom message to enum
                    matched_status = StatusMessage.from_custom_message(status)
                    if matched_status:
                        # If we found a match, use the formatted message
                        self.status_queue.put_nowait(status)
                    else:
                        # If no match, use the message as is
                        self.status_queue.put_nowait(status)
            except Exception:
                pass

    def cleanup(self) -> None:
        """Cleans up all composed components."""
        logger.info("Discrete Runner: Cleaning up...")
        self._stop_event.set()  # Signal event loop

        # Cleanup components in reasonable order
        self.audio_recorder.cleanup()
        self.command_processor.cleanup()
        self.context_manager.cleanup()

        # Clear action queue
        while not self._action_queue.empty():
            try:
                self._action_queue.get_nowait()
            except queue.Empty:
                break

        logger.info("Discrete Runner: Cleanup finished.")

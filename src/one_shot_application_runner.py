# src/one_shot_application_runner.py
import logging
import queue
import threading
import time
import traceback

from src.app_config import AppConfig
from src.application_interface import ApplicationInterface
from src.audio.audio_recorder import AudioRecorder
from src.command_processor import CommandProcessor
from src.context_manager import ContextManager
from src.types.status_messages import StatusMessage
from src.utils.timing import time_method

# Configure logging
logger = logging.getLogger(__name__)


class OneShotApplicationRunner(ApplicationInterface):
    """
    Placeholder for an application runner that sends audio for transcription
    and LLM response in a single step.
    """

    def __init__(
        self,
        config: AppConfig,
        context_manager: ContextManager,
        command_processor: CommandProcessor,
        audio_recorder: AudioRecorder,
        status_queue: queue.Queue | None,
    ):
        self.config = config
        self.context_manager = context_manager
        self.command_processor = command_processor
        self.audio_recorder = audio_recorder
        self.status_queue = status_queue
        self._stop_event = threading.Event()
        self._action_queue = queue.Queue()  # Placeholder for potential actions

        logger.info(
            f"OneShotApplicationRunner initialized. Mode: {self.config.application_mode}"
        )
        if self.status_queue:
            self.status_queue.put(
                f"one_shot Runner: Initialized (Mode: {self.config.application_mode})"
            )

    @time_method
    def trigger_interaction(self) -> None:
        """Queues the start action if preconditions met."""
        if self.command_processor.is_processing:
            self._update_status(StatusMessage.PROCESSING_BUSY)
            return
        if self.audio_recorder.is_recording:
            self._update_status(StatusMessage.ALREADY_RECORDING)
            return

        self._action_queue.put("START")
        self._update_status(StatusMessage.HOTKEY_PRESSED)

    def run(self) -> None:
        """Main event loop processing actions."""
        while not self._stop_event.is_set():
            try:
                action = self._action_queue.get(timeout=0.5)
                if action == "START":
                    self._handle_start_recording()
            except queue.Empty:
                continue  # Check stop event
            except Exception as e:
                logger.error(f"One-Shot Runner Error: {e}")
                traceback.print_exc()
        logger.info("One-Shot Runner: Event loop stopped.")

    def _handle_start_recording(self):
        """Initiates context fetch and audio recording."""
        timestamp = time.strftime("%H:%M:%S")
        logger.info(f"[{timestamp}] One-Shot Runner: Handling start action...")

        # Start context fetch (non-blocking)
        self.context_manager.fetch_context_async()

        # Start audio recording (non-blocking), provide callback
        if not self.audio_recorder.start_recording(self._process_recorded_audio):
            logger.error(
                f"[{timestamp}] One-Shot Runner: Failed to start audio recorder."
            )

    def _process_recorded_audio(self, audio_buffer: bytes | None):
        """
        Callback function passed to AudioRecorder.
        Executed by AudioRecorder's monitor thread.
        Handles transcription, context waiting, and command processing.
        """
        timestamp = time.strftime("%H:%M:%S")
        logger.info(
            f"[{timestamp}] One-Shot Runner: Received audio buffer from recorder."
        )

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
        logger.info(f"[{timestamp}] One-Shot Runner: Sending off audio...")
        self._update_status(StatusMessage.PROCESSING_BUSY)

        # --- Wait for Context ---
        logger.info(f"[{timestamp}] One-Shot Runner: Waiting for context...")
        _ = self.context_manager.wait_for_context(timeout=5.0)
        # Get the full context dict (app_name + doc_text)
        current_context_data = self.context_manager.get_current_context()
        logger.info(
            f"[{timestamp}] One-Shot Runner: Context ready (App: {current_context_data.get('app_name')})."
        )

        # --- Process Command ---
        logger.info(f"[{timestamp}] One-Shot Runner: Initiating command processing...")
        # CommandProcessor handles the processing lock and thread internally
        self.command_processor.process_command(current_context_data, "", audio_buffer)

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
        logger.info("One-Shot Runner: Cleaning up...")
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

# src/command_processor.py
import logging
import queue
import threading
import time
import traceback

from src.engines.processing_engine import ProcessingEngine
from src.types.modes import CommandMode
from src.types.status_messages import StatusMessage

# Configure logging
logger = logging.getLogger(__name__)


class CommandProcessor:
    """Handles the execution of the command processing pipeline."""

    def __init__(
        self,
        processing_engine: ProcessingEngine,
        status_queue: queue.Queue | None,
    ):
        self.processing_engine = processing_engine
        self.status_queue = status_queue
        self._lock = threading.Lock()
        self._is_processing = False
        self._processing_thread: threading.Thread | None = None

    @property
    def is_processing(self) -> bool:
        """Returns True if a command is currently being processed."""
        with self._lock:
            # Check thread state as well for robustness
            if self._is_processing and (
                not self._processing_thread or not self._processing_thread.is_alive()
            ):
                logger.warning(
                    "is_processing=True but thread is dead. Resetting state."
                )
                self._is_processing = False  # Auto-correct state
            return self._is_processing

    def process_command(
        self,
        context_data: dict[str, str | None],
        user_text_command: str,
        user_command_audio: bytes | None = None,
        mode: CommandMode | None = CommandMode.default_mode,
    ) -> bool:
        """
        Starts the processing pipeline in a background thread if not already processing.

        Returns:
            bool: True if processing was initiated, False otherwise (e.g., busy).
        """
        timestamp = time.strftime("%H:%M:%S")
        if (
            not user_text_command or not user_text_command.strip()
        ) and not user_command_audio:
            logger.info(f"[{timestamp}] CommandProcessor: Skipping empty command.")
            self._update_status(StatusMessage.READY)
            return False

        # Make copies of data outside the lock to minimize lock holding time
        context_copy = context_data.copy()
        command_copy = user_text_command
        doc_text_copy = context_copy.get(
            "doc_text"
        )  # Extract doc_text for processing engine

        with self._lock:
            if self._is_processing:
                logger.info(
                    f"[{timestamp}] CommandProcessor: Busy (is_processing is True). Skipping command: '{command_copy[:30]}...'"
                )
                self._update_status(StatusMessage.BUSY)
                return False

            # Mark as processing and store the thread reference under lock
            self._is_processing = True
            self._processing_thread = threading.Thread(
                target=self._processing_thread_target,
                args=(
                    context_copy,
                    doc_text_copy,
                    command_copy,
                    mode,
                    user_command_audio,
                ),
                daemon=True,
                name="ProcessingThread",
            )

        # Start the thread outside the lock
        logger.info(
            f"[{timestamp}] CommandProcessor: Starting processing thread for command: '{command_copy[:30]}...'"
        )
        self._processing_thread.start()
        return True

    def _processing_thread_target(
        self,
        current_context: dict[str, str | None],
        processing_text: str | None,
        user_text_command: str,
        mode: CommandMode,
        user_command_audio: bytes | None = None,
    ) -> None:
        """Target for the processing thread."""
        timestamp = time.strftime("%H:%M:%S")
        success = False
        error_msg = ""
        try:
            app_name_for_log = current_context.get("app_name", "N/A")
            logger.info(f"[{timestamp}] --- Starting Processing Pipeline ---")
            logger.info(f"[{timestamp}] Context App: {app_name_for_log}")
            logger.info(f"[{timestamp}] User Command: '{user_text_command}'")

            match mode:
                case CommandMode.ACTION:
                    self.processing_engine.process_action(
                        current_context=current_context,
                        processing_text=processing_text,
                        user_text_command=user_text_command,
                        user_command_audio=user_command_audio,
                    )
                case CommandMode.DICTATION:
                    self.processing_engine.process_dictation(
                        current_context=current_context,
                        processing_text=processing_text,
                        user_text_command=user_text_command,
                        user_command_audio=user_command_audio,
                    )
                case _:
                    raise ValueError(
                        f"Unsupported CommandMode for CommandProcessor: {mode}"
                    )

            logger.info(f"[{timestamp}] Processing engine finished successfully.")
            success = True

        except Exception as e:
            logger.error(
                f"[{timestamp}] Error during processing pipeline execution: {e}"
            )
            logger.error(traceback.format_exc())
            error_msg = str(e)
        finally:
            with self._lock:
                self._is_processing = False
                # Clear thread reference *before* releasing lock if another process checks is_processing
                self._processing_thread = None
            # The lock is automatically released by the 'with' statement.

            logger.info(f"[{timestamp}] --- Processing Pipeline Finished ---")
            final_status = (
                "Processing successful" if success else f"Error processing: {error_msg}"
            )
            self._update_status(final_status)
            # Set final "Ready" status after a short delay
            threading.Timer(1.5, self._update_status, args=["Ready"]).start()

    def _update_status(self, message: str) -> None:
        """Safely puts a status message onto the UI queue."""
        if self.status_queue:
            try:
                self.status_queue.put_nowait(message)
            except queue.Full:
                logger.warning(f"Status queue full. Dropping message: {message}")
            except Exception as e:
                logger.error(f"Error putting status in queue: {e}")

    def cleanup(self) -> None:
        """Cleans up the command processor resources."""
        logger.info("CommandProcessor: Cleaning up...")
        thread_to_join = None
        with self._lock:
            thread_to_join = self._processing_thread

        if thread_to_join and thread_to_join.is_alive():
            logger.info("CommandProcessor: Waiting for processing thread...")
            thread_to_join.join(timeout=5.0)  # Allow reasonable time

        # Final check/release of lock just in case
        if self._lock.locked():
            logger.info("CommandProcessor: Releasing lock during cleanup.")
            try:
                self._lock.release()
            except RuntimeError:
                pass
        logger.info("CommandProcessor: Cleanup finished.")

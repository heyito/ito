# src/context_manager.py
import logging
import threading
import time
import traceback

from src import platform_utils_macos as platform_utils  # Or abstract this more
from src.engines.context_engine import ContextEngine
from src.types.modes import CommandMode

# Configure logging
logger = logging.getLogger(__name__)


class ContextManager:
    """Handles fetching and storing application context."""

    def __init__(self, context_engine: ContextEngine):
        self.context_engine = context_engine
        self._current_context: dict[str, str | None] = {
            "app_name": None,
            "doc_text": None,
        }
        self._fetch_thread: threading.Thread | None = None
        self._lock = (
            threading.Lock()
        )  # Protects access to _current_context and _fetch_thread

    def get_current_context(self) -> dict[str, str | None]:
        """Returns the last fetched context data."""
        with self._lock:
            # Return a copy to prevent external modification
            return self._current_context.copy()

    def fetch_context_async(self, mode: CommandMode) -> None:
        """Starts fetching context in a background thread."""
        with self._lock:
            if self._fetch_thread and self._fetch_thread.is_alive():
                logger.info("Context fetch already in progress. Skipping.")
                return

            logger.info("ContextManager: Checking active window...")
            # Reset context before fetching
            self._current_context = {"app_name": None, "doc_text": None}
            active_window_info = platform_utils.get_active_window_info()

            if not active_window_info or not active_window_info.get("app_name"):
                logger.warning("ContextManager: Could not determine active window.")
                self._current_context["app_name"] = "Unknown"
                return  # Don't start thread

            app_name = active_window_info.get("app_name", "Unknown")
            self._current_context["app_name"] = app_name
            logger.info(
                f"ContextManager: Active app '{app_name}'. Starting fetch thread..."
            )

            self._fetch_thread = threading.Thread(
                target=self._fetch_target,
                args=(app_name, mode),  # Pass app_name explicitly
                daemon=True,
                name="ContextFetchThread",
            )
            self._fetch_thread.start()

    def _fetch_target(self, app_name: str, mode: CommandMode) -> None:
        """Internal target for the context fetching thread."""
        fetch_start_time = time.time()
        fetched_context: str | None = None
        error_occurred = False
        try:
            # Create context dict for the engine call *within the thread*
            context_for_engine = {"app_name": app_name, "doc_text": None}
            fetched_context = None
            match mode:
                case CommandMode.ACTION:
                    fetched_context = self.context_engine.get_full_app_context(
                        context_for_engine
                    )
                case CommandMode.DICTATION:
                    fetched_context = self.context_engine.get_focused_cursor_context(
                        context_for_engine
                    )
                case _:
                    raise ValueError(
                        f"Unsupported CommandMode for ContextManager: {mode}"
                    )
            if fetched_context is None:
                logger.warning(
                    f"[{time.strftime('%H:%M:%S')}] ContextManager: Engine returned None for '{app_name}'."
                )
        except Exception as e:
            error_occurred = True
            logger.error(
                f"[{time.strftime('%H:%M:%S')}] ContextManager: Error fetching context for '{app_name}': {e}"
            )
            traceback.print_exc()
        finally:
            with self._lock:
                # Update context *only if* this thread is the current fetch thread
                # (Handles potential race condition if fetch_context_async is called rapidly)
                if threading.current_thread() == self._fetch_thread:
                    # Only update doc_text, app_name was set before thread start
                    self._current_context["doc_text"] = fetched_context
                else:
                    logger.info(
                        f"[{time.strftime('%H:%M:%S')}] ContextManager: Stale fetch result ignored."
                    )

            fetch_duration = time.time() - fetch_start_time
            status = (
                "failed" if error_occurred or fetched_context is None else "succeeded"
            )
            logger.info(
                f"[{time.strftime('%H:%M:%S')}] ContextManager: Fetch thread finished ({status}, {fetch_duration:.3f}s)."
            )

    def wait_for_context(self, timeout: float = 5.0) -> str | None:
        """Waits for the current fetch operation to complete."""
        thread_to_wait = None
        with self._lock:
            thread_to_wait = self._fetch_thread

        if thread_to_wait and thread_to_wait.is_alive():
            timestamp = time.strftime("%H:%M:%S")
            logger.info(
                f"[{timestamp}] ContextManager: Waiting for context fetch (timeout: {timeout}s)..."
            )
            thread_to_wait.join(timeout=timeout)
            if thread_to_wait.is_alive():
                logger.warning(
                    f"[{timestamp}] ContextManager: Warning: Context fetch timed out."
                )
                # Don't clear self._fetch_thread here, let it finish/error out
                return None  # Indicate timeout

        # Return the potentially updated doc_text
        with self._lock:
            return self._current_context.get("doc_text")

    def cleanup(self) -> None:
        """Cleans up the context manager resources."""
        logger.info("ContextManager: Cleaning up...")
        thread_to_join = None
        with self._lock:
            thread_to_join = self._fetch_thread
            self._fetch_thread = None  # Prevent new waits/access

        if thread_to_join and thread_to_join.is_alive():
            logger.info("ContextManager: Waiting for running fetch thread...")
            thread_to_join.join(timeout=1.0)  # Short timeout on cleanup
        logger.info("ContextManager: Cleanup finished.")

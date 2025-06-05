import logging
import os
import time
import traceback
from multiprocessing import Event, Process, Queue

from pynput import keyboard

from src.utils.platform_utils_macos import check_accessibility_permission_no_prompt

# Configure logger
logger = logging.getLogger(__name__)


class KeyboardListenerProcess(Process):
    """Process class for running the keyboard listener"""

    def __init__(self, event_queue: Queue, status_queue: Queue, stop_event: Event):
        super().__init__()
        self.event_queue = event_queue
        self.status_queue = status_queue
        self.stop_event = stop_event
        self._listener = None
        self.daemon = True
        logger.info("KeyboardListenerProcess initialized")

    def run(self):
        listener_thread_unexpectedly_stopped = False
        try:
            logger.info(
                f"KeyboardListenerProcess (PID: {os.getpid()}) run method starting."
            )

            # Wait for input monitoring access
            while not self.stop_event.is_set():
                if check_accessibility_permission_no_prompt():
                    logger.info(
                        "Accessibility granted, proceeding with keyboard listener setup."
                    )
                    break
                logger.info("Waiting for accessibility access...")
                time.sleep(1)  # Check every second

            if self.stop_event.is_set():
                logger.info(
                    "Stop event received while waiting for accessibility access."
                )
                return

            self._listener = keyboard.Listener(
                on_press=lambda key: self._on_press(key),
                on_release=lambda key: self._on_release(key),
            )
            with self._listener as pynput_listener_thread_instance:
                logger.info("Pynput listener context entered. Starting join loop.")
                while not self.stop_event.is_set():
                    pynput_listener_thread_instance.join(timeout=0.1)
                    if (
                        not self.stop_event.is_set()
                        and not pynput_listener_thread_instance.is_alive()
                    ):
                        error_msg = "CRITICAL: Pynput internal listener thread died unexpectedly in KeyboardListenerProcess."
                        logger.error(error_msg)
                        self.status_queue.put((False, error_msg))
                        listener_thread_unexpectedly_stopped = True
                        break  # Exit the while loop, the process will then terminate.
                if self.stop_event.is_set():
                    logger.info(
                        "Stop event received, listener loop terminating normally."
                    )
                elif listener_thread_unexpectedly_stopped:
                    logger.info("Listener loop terminated due to pynput thread dying.")
                else:
                    logger.warning(
                        "Listener loop exited for an unknown reason while stop_event was not set."
                    )
        except Exception as e:
            error_msg = f"Error in keyboard listener process run method: {str(e)}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            self.status_queue.put((False, error_msg))
        finally:
            logger.info(
                f"KeyboardListenerProcess (PID: {os.getpid()}) run method ending."
            )
            if (
                listener_thread_unexpectedly_stopped and not self.status_queue.full()
            ):  # ensure not to block
                try:
                    self.status_queue.put_nowait(
                        (False, "Pynput listener thread died and process is exiting.")
                    )
                except:  # full queue
                    pass

    def _on_press(self, key):
        """Handle key press events in the process"""
        try:
            # logger.info(f"Key pressed: {key}")
            # Forward the raw key press event
            self.event_queue.put(("press", key))
        except Exception as e:
            logger.error(f"Error in _on_press: {e}")

    def _on_release(self, key):
        """Handle key release events in the process"""
        try:
            # logger.info(f"Key released: {key}")
            # Forward the raw key release event
            self.event_queue.put(("release", key))
        except Exception as e:
            logger.error(f"Error in _on_release: {e}")

    def stop(self):
        """Stop the keyboard listener process gracefully"""
        logger.info("Stopping keyboard listener process")
        self.stop_event.set()
        if self._listener:
            self._listener.stop()
        self.join(timeout=1.0)  # Wait for the process to finish with timeout

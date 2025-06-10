# audio_device_manager.py (Singleton with Lifecycle Management)

import logging
import threading
from typing import Any

import soundcard as sc

logger = logging.getLogger(__name__)


class AudioDeviceManager:
    """
    A singleton class that manages and monitors the system's default audio input device.
    It runs a background thread to preemptively detect device changes.

    The lifecycle must be managed by the main application:
    - Call AudioDeviceManager.start() on application startup.
    - Call AudioDeviceManager.stop() on application shutdown.
    """

    _instance = None
    _lock = threading.Lock()  # Lock for instance creation

    # Make __init__ "private" by convention
    def __init__(self):
        if self._instance is not None:
            # This check prevents re-initialization, which is good practice for singletons.
            raise RuntimeError(
                "Use AudioDeviceManager.get_instance() to get the instance."
            )

        logger.info("Initializing AudioDeviceManager utility.")
        self._current_device: Any | None = None
        self._device_lock = threading.Lock()  # Lock for accessing the device
        self._monitor_thread: threading.Thread | None = None
        self._stop_event = threading.Event()

    @classmethod
    def get_instance(cls):
        """Gets the singleton instance, creating it if it doesn't exist."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def _monitor_devices_target(self):
        """The target function for the background monitoring thread."""
        logger.info("Audio device monitor thread started.")
        while not self._stop_event.is_set():
            new_device = sc.default_microphone()

            with self._device_lock:
                current_id = self._current_device.id if self._current_device else None
                new_id = new_device.id if new_device else None

                if current_id != new_id:
                    device_name = f"'{new_device.name}'" if new_device else "None"
                    logger.info(f"Default microphone changed. Now using: {device_name}")
                    self._current_device = new_device

            self._stop_event.wait(1.0)
        logger.info("Audio device monitor thread stopped.")

    def _start_monitoring(self):
        """Starts the background device monitoring thread."""
        if self._monitor_thread is None or not self._monitor_thread.is_alive():
            self._stop_event.clear()
            self._monitor_thread = threading.Thread(
                target=self._monitor_devices_target,
                daemon=True,
                name="DeviceMonitorThread",
            )
            self._monitor_thread.start()

    def _stop_monitoring(self):
        """Stops the background device monitoring thread."""
        logger.info("Stopping audio device monitor.")
        self._stop_event.set()
        if self._monitor_thread and self._monitor_thread.is_alive():
            self._monitor_thread.join(timeout=1.5)
        self._monitor_thread = None

    def get_current_microphone(self) -> Any | None:
        """Thread-safely returns the currently selected default microphone."""
        with self._device_lock:
            return self._current_device

    # --- Public Class Methods for Lifecycle Management ---

    @classmethod
    def start(cls):
        """Starts the singleton's monitoring service."""
        logger.info("Request to start AudioDeviceManager service.")
        instance = cls.get_instance()
        instance._start_monitoring()

    @classmethod
    def stop(cls):
        """Stops the singleton's monitoring service."""
        logger.info("Request to stop AudioDeviceManager service.")
        instance = cls.get_instance()
        if instance:
            instance._stop_monitoring()

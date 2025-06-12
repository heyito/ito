import logging
import os
import uuid

from amplitude import Amplitude, BaseEvent
from PySide6.QtCore import QSettings

logger = logging.getLogger(__name__)


class AmplitudeManager:
    _instance = None
    _API_KEY = "3e7f88d14d2f5e48e2ebddf9d5bf9872"  # Project API Keys are public https://amplitude.com/docs/apis/keys-and-tokens

    def __init__(self):
        if AmplitudeManager._instance is not None:
            raise Exception("This class is a singleton!")
        else:
            self._client = None
            self._device_id = None
            AmplitudeManager._instance = self

    @classmethod
    def instance(cls):
        if cls._instance is None:
            cls._instance = AmplitudeManager()
        return cls._instance

    def initialize(self):
        """
        Initializes the Amplitude client.
        """
        api_key = self._API_KEY
        if not api_key:
            logger.warning(
                "AMPLITUDE_API_KEY not set in code. Amplitude analytics will be disabled."
            )
            return

        self._load_or_create_device_id()

        try:
            self._client = Amplitude(api_key)
            logger.info("Amplitude client initialized.")
        except Exception as e:
            logger.error(f"Failed to initialize Amplitude client: {e}")
            self._client = None

    def _load_or_create_device_id(self):
        """
        Loads a persistent device ID from QSettings, or creates and saves a new one.
        """
        # NOTE: These values must match the organization and application name
        # set in main.py for QSettings to work correctly.
        settings = QSettings("Ito", "Ito")
        device_id = settings.value("device_id")

        if device_id:
            self._device_id = device_id
            logger.info(f"Loaded device ID: {self._device_id}")
        else:
            self._device_id = str(uuid.uuid4())
            settings.setValue("device_id", self._device_id)
            logger.info(f"Created and saved new device ID: {self._device_id}")

    def track_event(self, event: BaseEvent):
        """
        Tracks an event using the Amplitude client.
        """
        if not self._client:
            logger.warning("Amplitude client not initialized. Cannot track event.")
            return

        # Ensure the event has an identifier if one isn't already set
        if not event.user_id and not event.device_id:
            event.device_id = self._device_id

        try:
            logger.info(
                f"Tracking event: '{event.event_type}' with properties: {event.event_properties}, device_id: {event.device_id}"
            )
            self._client.track(event)
            logger.info("Event passed to Amplitude client for processing.")
        except Exception as e:
            logger.error(f"Failed to track Amplitude event: {e}", exc_info=True)

    def shutdown(self):
        """
        Shuts down the Amplitude client, flushing any buffered events.
        """
        if self._client:
            try:
                self._client.shutdown()
                logger.info("Amplitude client shut down successfully.")
            except Exception as e:
                logger.error(f"Failed to shut down Amplitude client: {e}")
            finally:
                self._client = None

from enum import Enum
from typing import Optional

class StatusMessage(Enum):
    """Enum for all possible status messages in the application."""
    READY = "Ready"
    STARTING = "Starting background application thread..."
    STARTED = "Application thread started. Listening for hotkey."
    STOPPED = "Application stopped"
    RESTARTING = "Restarting application..."
    SETTINGS_SAVED = "Settings saved."
    SETTINGS_SAVED_RESTARTING = "Settings saved. Restarting application..."
    HOTKEY_IGNORED = "Hotkey ignored: Application not running."
    HOTKEY_PRESSED = "Hotkey pressed, initiating command..."
    PROCESSING_BUSY = "Processing busy, please wait..."
    ALREADY_RECORDING = "Already recording..."
    LISTENING = "Listening for hotkey '{hotkey}'..."
    LISTENER_FAILED = "Hotkey listener failed to start!"
    ERROR = "Application error occurred"
    RECORDING = "Recording command..."
    ERROR_RECORDING = "Error processing audio"
    TRANSCRIBING = "Transcribing command..."
    READY_EMPTY = "Ready (empty transcription)"
    TRANSCRIBED = "Transcribed: '{text}'"
    ASR_ERROR = "ASR Error: {error}"

    def format(self, **kwargs) -> str:
        """Format the status message with any provided keyword arguments."""
        return self.value.format(**kwargs)

    @classmethod
    def from_custom_message(cls, message: str) -> Optional['StatusMessage']:
        """Try to match a custom message to a StatusMessage enum value.
        Returns None if no match is found."""
        # Check for transcribed messages
        if message.startswith("Transcribed: '"):
            return cls.TRANSCRIBED
        # Check for ASR error messages
        if message.startswith("ASR Error: "):
            return cls.ASR_ERROR
        # Check for exact matches
        for status in cls:
            if message == status.value:
                return status
        return None 
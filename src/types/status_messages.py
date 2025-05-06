from enum import Enum

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

    def format(self, **kwargs) -> str:
        """Format the status message with any provided keyword arguments."""
        return self.value.format(**kwargs) 
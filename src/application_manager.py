# application_manager.py
import logging
import queue
import threading
import time
import traceback
from typing import Any

from PySide6.QtCore import QObject, QSettings, QTimer, Signal

from src.application_interface import ApplicationInterface
from src.constants import DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE
from src.containers import Container
from src.keyboard.keyboard_manager import KeyboardManager
from src.types.modes import CommandMode
from src.types.status_messages import StatusMessage
from src.ui.status_window import StatusWindow

# Configure logging
logger = logging.getLogger(__name__)


class ApplicationManager(QObject):
    # Singleton instance
    _instance = None

    # Signals for UI updates
    error_occurred = Signal(str)  # Emits error messages
    status_changed = Signal(str)  # Emits status updates
    settings_changed = Signal()  # Emits when settings are updated
    hotkey_pressed = Signal(
        str
    )  # NEW: Signal when hotkey is pressed, passes key string

    @classmethod
    def instance(cls):
        if cls._instance is None:
            raise Exception("ApplicationManager has not been initialized.")
        return cls._instance

    def __init__(self, organization_name: str, application_name: str):
        if ApplicationManager._instance is not None:
            raise Exception(
                "ApplicationManager is a singleton! Use ApplicationManager.instance()"
            )
        super().__init__()
        ApplicationManager._instance = self
        self.organization_name = organization_name
        self.application_name = application_name
        self.settings = QSettings(organization_name, application_name)

        self.container = Container()
        self.app_thread: threading.Thread | None = None
        self.app_instance: ApplicationInterface | None = None
        self.error_queue = queue.Queue()
        self.status_queue = queue.Queue()

        # Get keyboard manager instance and connect to its signal
        self.keyboard_manager = KeyboardManager.instance()
        self.keyboard_manager.hotkey_pressed.connect(self._handle_hotkey_press)
        self.keyboard_manager.hotkey_released.connect(self._handle_hotkey_release)

        # Load initial settings and configure container
        config = self.load_settings()
        self.container.config.from_dict(config)
        # If wanting to add long hold vs tap back refer to
        # https://github.com/demox-labs/ito/pull/9
        # self.hold_threshold = 0.5
        # self.hotkey_thread = threading.Timer(self.hold_threshold, self._hold_check)
        # self.hotkey_thread_lock = threading.Lock()
        # self.is_hotkey_long_hold = False
        # self.is_hotkey_tap = False

        # Initialize status window
        self.status_window = StatusWindow()
        self.status_window.show()

        # Connect status signals to status window
        self.status_changed.connect(
            lambda status: self.status_window.update_status(status)
        )
        self.error_occurred.connect(
            lambda error: self.status_window.update_status(error, is_error=True)
        )

    def load_settings(self) -> dict[str, Any]:
        """Load settings from QSettings and convert to config format"""
        config = {}

        # API Key settings
        config["APIKeys"] = {
            "openai_api_key": self.settings.value("APIKeys/openai_api_key", ""),
            "groq_api_key": self.settings.value("APIKeys/groq_api_key", ""),
            "gemini_api_key": self.settings.value("APIKeys/gemini_api_key", ""),
        }

        # OpenAI settings
        config["OpenAI"] = {
            "user_command_model": self.settings.value(
                "OpenAI/user_command_model", "gpt-4.1"
            ),
            "asr_model": self.settings.value("OpenAI/asr_model", "whisper-1"),
        }

        config["Gemini"] = {
            "user_command_model": self.settings.value(
                "Gemini/user_command_model", "gemini-2.0-flash"
            ),
            "asr_model": self.settings.value("Gemini/asr_model", "gemini-2.0-flash"),
        }

        # Ollama settings
        config["Ollama"] = {
            "model": self.settings.value("Ollama/model", "llama3.2:latest")
        }

        # Groq settings
        config["Groq"] = {
            "user_command_model": self.settings.value(
                "Groq/user_command_model", "llama-3.3-70b-versatile"
            ),
            "asr_model": self.settings.value("Groq/asr_model", "whisper-large-v3"),
        }

        # ASR settings
        config["ASR"] = {
            "source": self.settings.value("ASR/source", "openai_api"),
            "model": self.settings.value("ASR/model", "whisper-1"),
            "local_model_size": self.settings.value("ASR/local_model_size", "base.en"),
            "compute_type": self.settings.value("ASR/compute_type", "default"),
        }

        # LLM settings
        config["LLM"] = {
            "source": self.settings.value("LLM/source", "openai_api"),
            "model": self.settings.value("LLM/model", "gpt-4.1"),
            "max_tokens": int(
                self.settings.value("LLM/max_tokens", DEFAULT_MAX_TOKENS)
            ),
            "temperature": float(
                self.settings.value("LLM/temperature", DEFAULT_TEMPERATURE)
            ),
        }

        # Audio settings
        config["Audio"] = {
            "sample_rate": int(self.settings.value("Audio/sample_rate", 16000)),
            "channels": int(self.settings.value("Audio/channels", 1)),
        }

        # Hotkey settings
        config["Hotkeys"] = {
            "dictation_hotkey": self.settings.value("Hotkeys/dictation_hotkey", "fn"),
            "action_hotkey": self.settings.value("Hotkeys/action_hotkey", "f10"),
        }

        config["Mode"] = {
            "application_mode": self.settings.value(
                "Mode/application_mode", "discrete"
            ).lower()
        }

        # Set the hotkey in the keyboard manager
        self.keyboard_manager.set_hotkeys(
            {
                CommandMode.DICTATION: config["Hotkeys"]["dictation_hotkey"],
                CommandMode.ACTION: config["Hotkeys"]["action_hotkey"],
            }
        )

        return config

    def save_settings(self, new_settings: dict[str, Any]) -> bool:
        """Save settings to QSettings and update application if running"""
        try:
            # Save each section
            for section, values in new_settings.items():
                for key, value in values.items():
                    self.settings.setValue(f"{section}/{key}", value)

            self.settings.sync()
            self.settings_changed.emit()

            # Update hotkey if changed
            new_dictation_hotkey = new_settings.get("Hotkeys", {}).get(
                "dictation_hotkey"
            )
            new_action_hotkey = new_settings.get("Hotkeys", {}).get("action_hotkey")
            self.keyboard_manager.set_hotkeys(
                {
                    CommandMode.ACTION: new_action_hotkey,
                    CommandMode.DICTATION: new_dictation_hotkey,
                }
            )

            # If application is running, restart it to apply new settings
            if self.app_thread and self.app_thread.is_alive():
                self.status_changed.emit(StatusMessage.SETTINGS_SAVED_RESTARTING.value)
                self.restart_application()
            else:
                self.status_changed.emit(StatusMessage.SETTINGS_SAVED.value)

            return True

        except Exception as e:
            error_msg = f"Failed to save settings: {str(e)}"
            logger.error(f"{error_msg}\n{traceback.format_exc()}")
            self.error_occurred.emit(error_msg)
            return False

    def start_application(self) -> bool:
        """Start the application background thread and the hotkey listener."""
        logger.info("Starting application...")

        # Prevent double-start
        if self.app_thread and self.app_thread.is_alive():
            logger.info("Application thread already running. Not starting again.")
            self.status_changed.emit(StatusMessage.STARTED.value)
            return False

        try:
            # Stop any existing application first (should be a no-op if already stopped)
            self.stop_application()

            # Load current settings
            config = self.load_settings()
            is_valid, error_msg = self.validate_settings(config)
            if not is_valid:
                self.error_occurred.emit(f"Invalid settings, cannot start: {error_msg}")
                return False

            # Check if keyboard manager has valid hotkeys
            if not self.keyboard_manager._target_hotkeys:
                self.error_occurred.emit(
                    "Invalid or unsupported hotkey. Cannot start listener."
                )
                return False

            # Create a new stop event for the thread
            self._stop_app_thread_event = threading.Event()

            # Start application in a separate thread
            self.status_changed.emit(StatusMessage.STARTING.value)
            self.app_thread = threading.Thread(
                target=self._run_application_thread,
                args=(config, self._stop_app_thread_event),
                daemon=True,
                name="DiscreteAppThread",
            )
            self.app_thread.start()

            # Start status queue monitor thread
            self._start_status_queue_monitor()

            # Emit STARTED status
            self.status_changed.emit(StatusMessage.STARTED.value)

            # Add a small delay to ensure the application is fully initialized
            QTimer.singleShot(
                1000, lambda: self.status_changed.emit(StatusMessage.READY.value)
            )

            return True

        except Exception as e:
            error_msg = f"Failed to start application: {str(e)}"
            logger.error(f"{error_msg}\n{traceback.format_exc()}")
            self.error_occurred.emit(error_msg)
            self.status_changed.emit(StatusMessage.ERROR.value)
            self.stop_application()
            return False

    def stop_application(self) -> None:
        """Stop the application background thread."""
        logger.info("Initiating application stop sequence...")
        stopped_thread = False

        # Signal and stop the background thread
        if self.app_thread and self.app_thread.is_alive():
            logger.info("Signaling background application thread to stop...")
            if hasattr(self, "_stop_app_thread_event"):
                self._stop_app_thread_event.set()
            if self.app_instance:
                if hasattr(self.app_instance, "stop_recording_event"):
                    self.app_instance.stop_recording_event.set()
                if hasattr(self.app_instance, "stop_application_event"):
                    self.app_instance.stop_application_event.set()

            logger.info("Waiting for background application thread to join...")
            self.app_thread.join(timeout=2.0)  # Increased timeout
            if self.app_thread.is_alive():
                logger.warning(
                    "Warning: Background application thread did not exit cleanly."
                )
            else:
                logger.info("Background application thread joined.")
                stopped_thread = True
            self.app_thread = None
            self.app_instance = None
        else:
            logger.info("No background application thread to stop.")

        # Clear queues
        logger.info("Clearing queues...")
        while not self.error_queue.empty():
            try:
                self.error_queue.get_nowait()
            except queue.Empty:
                break

        while not self.status_queue.empty():
            try:
                self.status_queue.get_nowait()
            except queue.Empty:
                break

        if stopped_thread:
            self.status_changed.emit(StatusMessage.STOPPED.value)
            logger.info("Application stop sequence complete.")

    def closeEvent(self, event):
        """Handle window close event"""
        logger.info("ApplicationManager closeEvent: Stopping application...")
        self.stop_application()
        # Clean up keyboard manager
        logger.info("ApplicationManager closeEvent: Cleaning up keyboard manager...")
        self.keyboard_manager.cleanup()

        # Clean up browser app
        logger.info("ApplicationManager closeEvent: Stopping browser app...")
        if self.browser_app:
            self.browser_app.cleanup()

        # Optional: Explicitly shutdown container resources if needed
        # logger.info("ApplicationManager closeEvent: Shutting down container...")
        # self.container.shutdown_resources() # If using resource providers
        logger.info("ApplicationManager closeEvent: Finished.")

    def restart_application(self) -> bool:
        """Restart the application with current settings"""
        self.status_changed.emit(StatusMessage.RESTARTING.value)
        self.stop_application()
        # Add a small delay to ensure resources are released if needed
        # time.sleep(0.2)
        return self.start_application()

    def _run_application_thread(
        self, config: dict[str, Any], stop_event: threading.Event
    ) -> None:
        """
        Internal method executed in the background thread.
        Initializes and runs the AudioApplication.
        """
        try:
            logger.info("Background thread started.")
            logger.debug(
                f"DEBUG: stop_event.is_set() at thread start: {stop_event.is_set()}"
            )
            # Configure container within the thread using the passed config
            self.container = Container()  # Create a new container instance
            self.container.config.from_dict(config)
            self.app_instance = self.container.application()

            self.browser_app = self.container.browser_app()

            # Pass the stop event to the app instance
            self.app_instance.stop_recording_event = stop_event

            # Pass the status queue to the app instance
            self.app_instance.status_queue = self.status_queue
            self.app_instance.command_processor.status_queue = self.status_queue

            # audio recorder may not have a status queue, so we need to check if it exists
            if hasattr(self.app_instance, "audio_recorder"):
                self.app_instance.audio_recorder.status_queue = self.status_queue

            logger.info("Starting AudioApplication.run() in background thread...")
            # Run the application - it has its own event loop that will continue running
            # until the stop_event is set
            self.app_instance.run()
            logger.debug("DEBUG: AudioApplication.run() exited normally.")

        except Exception as e:
            error_msg = (
                f"Background Application Error: {str(e)}\n{traceback.format_exc()}"
            )
            logger.error(error_msg)
            # Use signal to report error back to the main thread's UI
            self.error_occurred.emit(f"Background Thread Error: {str(e)}")
            self.status_changed.emit(StatusMessage.ERROR.value)
        finally:
            logger.info("Background application thread finished.")
            # Clear the instance reference from the manager when the thread truly exits
            self.app_instance = None

    def _handle_hotkey_press(self, command_mode: CommandMode) -> None:
        """
        Handles the hotkey_pressed signal. Runs on the main Qt thread.
        Checks application state and queues the start recording action
        on the background application's queue.
        """
        timestamp = time.strftime("%H:%M:%S")
        # Check if the background application instance exists and is running
        logger.debug(
            f"self.app_instance: {self.app_instance}, self.app_thread: {self.app_thread}"
        )
        if not self.app_instance or not self.app_thread:
            logger.info(
                f"[{timestamp}] Hotkey Mode '{command_mode}' detected, but application is not running."
            )
            self.status_changed.emit(StatusMessage.HOTKEY_IGNORED.value)
            return
        self._trigger_interaction(
            command_mode,
        )

    def _handle_hotkey_release(self, hotkey_name: str) -> None:
        logger.info("Second completion hotkey tap detected.")
        logger.info("Stopping interaction and resetting hotkey tap state.")
        if not self.app_instance:
            logger.info("No app instance to stop interaction.")
            return

        self.app_instance.stop_interaction()

    def _trigger_interaction(self, command_mode: CommandMode) -> None:
        logger.info(
            f"Hotkey Mode '{command_mode}' detected by manager. Queuing action for background app."
        )
        try:
            self.app_instance.trigger_interaction(command_mode)
        except AttributeError:
            logger.error(
                "Error: Cannot queue action, app_instance or action_queue missing."
            )
        except Exception as e:
            logger.error(f"Error queuing action: {e}")
            self.error_occurred.emit(f"Error sending action to background app: {e}")

    def validate_settings(self, new_settings: dict[str, Any]) -> tuple[bool, str]:
        """Validate new settings and return (is_valid, error_message)"""
        try:
            # Check API key requirements
            llm_source = new_settings.get("LLM", {}).get("source")
            asr_source = new_settings.get("ASR", {}).get("source")
            api_keys = new_settings.get("APIKeys", {})
            openai_api_key = api_keys.get("openai_api_key")
            groq_api_key = api_keys.get("groq_api_key")
            gemini_api_key = api_keys.get("gemini_api_key")

            # OpenAI key check
            if llm_source == "openai_api" or asr_source == "openai_api":
                if not openai_api_key:
                    return (
                        False,
                        "OpenAI API key is required when OpenAI is selected for ASR or LLM.",
                    )

            # Groq key check
            if llm_source == "groq_api":  # Assuming Groq is only for LLM for now
                if not groq_api_key:
                    return (
                        False,
                        "Groq API key is required when Groq is selected for LLM.",
                    )

            if llm_source == "gemini_api" or asr_source == "gemini_api":
                if not gemini_api_key:
                    return (
                        False,
                        "Gemini API key is required when Gemini is selected for LLM.",
                    )

            # Check ASR settings
            if new_settings["ASR"]["source"] not in [
                "openai_api",
                "faster_whisper",
                "groq_api",
                "gemini_api",
            ]:
                return False, "Invalid ASR source"

            # If Groq ASR is selected, ensure Groq API key is present
            if new_settings["ASR"]["source"] == "groq_api" and not groq_api_key:
                return False, "Groq API key is required when Groq is selected for ASR."

            # Check LLM settings
            if new_settings["LLM"]["source"] not in [
                "ollama",
                "openai_api",
                "groq_api",
                "gemini_api",
            ]:
                return False, "Invalid LLM source"

            # Check Audio settings
            if not (8000 <= new_settings["Audio"]["sample_rate"] <= 48000):
                return False, "Invalid sample rate"
            if not (1 <= new_settings["Audio"]["channels"] <= 2):
                return False, "Invalid number of channels"

            # Check Hotkey settings
            dictation_hotkey = new_settings.get("Hotkeys", {}).get("dictation_hotkey")
            action_hotkey = new_settings.get("Hotkeys", {}).get("action_hotkey")
            if not dictation_hotkey or not action_hotkey:
                return False, "Hotkeys cannot be empty."

            return True, ""

        except KeyError as e:
            return False, f"Missing setting section/key: {e}"
        except Exception as e:
            return False, f"Settings validation error: {str(e)}"

    def close_hotkey_listener(self) -> None:
        """Call this ONCE on final shutdown to stop the listener."""
        if self.hotkey_listener:
            logger.info("Stopping hotkey listener (final shutdown)...")
            try:
                if self.hotkey_listener.running:
                    self.hotkey_listener.stop()
                    self.hotkey_listener.join(timeout=1.0)
                logger.info("Hotkey listener stopped.")
            except Exception as e:
                logger.error(f"Error stopping hotkey listener: {e}")
            self.hotkey_listener = None
            self._listener_started = False

    def _start_status_queue_monitor(self):
        """Start a thread to monitor the status_queue and emit status_changed."""

        def monitor():
            while self.app_thread and self.app_thread.is_alive():
                try:
                    status = self.status_queue.get(timeout=0.2)
                    self.status_changed.emit(status)
                except queue.Empty:
                    continue
                except Exception as e:
                    logger.error(f"Status queue monitor error: {e}")
                    break

        t = threading.Thread(target=monitor, daemon=True, name="StatusQueueMonitor")
        t.start()

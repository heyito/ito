# application_manager.py
from PyQt6.QtCore import QObject, pyqtSignal, QSettings, pyqtSlot
from src.containers import Container
from src.discrete_audio_application import DiscreteAudioApplication, _ACTION_START_RECORDING
import threading
import queue
import traceback
import time # Added for timestamp in logs
from typing import Dict, Any, Optional, Union

# --- Add pynput imports ---
try:
    from pynput import keyboard
    _pynput_available = True
except ImportError:
    _pynput_available = False
    keyboard = None # Define to avoid NameError later
# --- End Add pynput imports ---


class ApplicationManager(QObject):
    # Signals for UI updates
    error_occurred = pyqtSignal(str)  # Emits error messages
    status_changed = pyqtSignal(str)  # Emits status updates
    settings_changed = pyqtSignal()   # Emits when settings are updated
    hotkey_pressed = pyqtSignal(str) # NEW: Signal when hotkey is pressed, passes key string

    def __init__(self, organization_name: str, application_name: str):
        super().__init__()
        self.organization_name = organization_name
        self.application_name = application_name
        self.settings = QSettings(organization_name, application_name)

        self.container = Container()
        self.app_thread: Optional[threading.Thread] = None
        self.app_instance: Optional[DiscreteAudioApplication] = None
        self.error_queue = queue.Queue() # Keep if used elsewhere, maybe for internal errors

        # --- Add listener attribute ---
        self.hotkey_listener: Optional[keyboard.Listener] = None
        self._target_hotkey: Optional[Union[keyboard.Key, keyboard.KeyCode]] = None
        self._hotkey_str: Optional[str] = None
        self._listener_started = False  # NEW: Track if listener is started
        # --- End Add listener attribute ---

        # Load initial settings
        self.load_settings()

        # --- Connect the new signal to its handler ---
        self.hotkey_pressed.connect(self._handle_hotkey_press)
        # --- End Connect the new signal ---

        # Start the hotkey listener ONCE
        self.setup_hotkey_listener()

    def load_settings(self) -> Dict[str, Any]:
        """Load settings from QSettings and convert to config format"""
        # (Keep this method as is)
        config = {}

        # OpenAI settings
        config['OpenAI'] = {
            'api_key': self.settings.value("OpenAI/api_key", ""),
            'model': self.settings.value("OpenAI/model", "gpt-4")
        }

        # ASR settings
        config['ASR'] = {
            'source': self.settings.value("ASR/source", "faster_whisper"),
            'local_model_size': self.settings.value("ASR/local_model_size", "large-v3"),
            'device': self.settings.value("ASR/device", "auto"),
            'compute_type': self.settings.value("ASR/compute_type", "default")
        }

        # LLM settings
        config['LLM'] = {
            'source': self.settings.value("LLM/source", "openai_api"),
            'model': self.settings.value("LLM/model", "gpt-4"),
            'max_tokens': int(self.settings.value("LLM/max_tokens", 2000)),
            'temperature': float(self.settings.value("LLM/temperature", 0.7))
        }

        # Audio settings
        config['Audio'] = {
            'sample_rate': int(self.settings.value("Audio/sample_rate", 16000)),
            'channels': int(self.settings.value("Audio/channels", 1))
        }

        # VAD settings - Convert string to boolean properly
        vad_enabled = self.settings.value("VAD/enabled", "false")
        if isinstance(vad_enabled, str):
            vad_enabled = vad_enabled.lower() == 'true'
        else:
            vad_enabled = bool(vad_enabled)

        config['VAD'] = {
            'enabled': vad_enabled,
            'aggressiveness': int(self.settings.value("VAD/aggressiveness", 1)),
            'silence_duration_ms': int(self.settings.value("VAD/silence_duration_ms", 1000)),
            'frame_duration_ms': int(self.settings.value("VAD/frame_duration_ms", 30))
        }

        # Output settings
        config['Output'] = {
            'method': self.settings.value("Output/method", "typewrite")
        }

        # Hotkey settings
        config['Hotkeys'] = {
            'start_recording_hotkey': self.settings.value("Hotkeys/start_recording_hotkey", "f9")
        }

        # --- Store hotkey details for listener setup ---
        self._hotkey_str = config['Hotkeys']['start_recording_hotkey']
        self._target_hotkey = self._parse_hotkey(self._hotkey_str)
        # --- End Store hotkey details ---

        return config

    def _parse_hotkey(self, hotkey_str: str) -> Optional[Union[keyboard.Key, keyboard.KeyCode]]:
        """ Parses the hotkey string from config into a pynput key object. """
        if not _pynput_available or not hotkey_str:
            return None
        try:
            # Check if it's a special key (like Key.f9, Key.ctrl_l)
            return getattr(keyboard.Key, hotkey_str)
        except AttributeError:
            # If not a special key, treat it as a character key
            if len(hotkey_str) == 1:
                 return keyboard.KeyCode.from_char(hotkey_str)
            else:
                 # Handle potential complex hotkey strings (e.g., modifiers) if needed later
                 # For now, return None if it's not recognized simply
                 print(f"Warning: Hotkey '{hotkey_str}' is not a simple character or directly supported Key name.")
                 return None

    def save_settings(self, new_settings: Dict[str, Any]) -> bool:
        """Save settings to QSettings and update application if running"""
        try:
            # --- Update stored hotkey before saving ---
            self._hotkey_str = new_settings.get('Hotkeys', {}).get('start_recording_hotkey', 'f9')
            self._target_hotkey = self._parse_hotkey(self._hotkey_str)
            # --- End Update stored hotkey ---

            # Save each section
            for section, values in new_settings.items():
                for key, value in values.items():
                    self.settings.setValue(f"{section}/{key}", value)

            self.settings.sync()
            self.settings_changed.emit() # Signal UI to reload maybe

            # If application is running, restart it to apply new settings (including hotkey)
            if self.app_thread and self.app_thread.is_alive():
                self.status_changed.emit("Settings saved. Restarting application...")
                self.restart_application()
            else:
                 self.status_changed.emit("Settings saved.")

            return True

        except Exception as e:
            error_msg = f"Failed to save settings: {str(e)}"
            print(f"{error_msg}\n{traceback.format_exc()}") # Log detailed error
            self.error_occurred.emit(error_msg)
            return False

    def start_application(self) -> bool:
        """Start the application background thread and the hotkey listener."""
        if not _pynput_available:
            self.error_occurred.emit("Pynput library not found. Hotkeys disabled.")
            self.status_changed.emit("Application cannot start (missing pynput).")
            return False

        # Prevent double-start
        if self.app_thread and self.app_thread.is_alive():
            print("Application thread already running. Not starting again.")
            self.status_changed.emit("Application already running.")
            return False

        try:
            # Stop any existing application first (should be a no-op if already stopped)
            self.stop_application()

            # Load current settings (ensures _hotkey_str and _target_hotkey are set)
            config = self.load_settings()
            is_valid, error_msg = self.validate_settings(config)
            if not is_valid:
                self.error_occurred.emit(f"Invalid settings, cannot start: {error_msg}")
                return False
            if not self._target_hotkey:
                self.error_occurred.emit(f"Invalid or unsupported hotkey '{self._hotkey_str}'. Cannot start listener.")
                return False

            # Clear the stop event before starting
            self._stop_app_thread_event = threading.Event()

            # Start application in a separate thread
            self.status_changed.emit("Starting background application thread...")
            self.app_thread = threading.Thread(
                target=self._run_application_thread, # Renamed target
                args=(config, self._stop_app_thread_event), # Pass config and stop event
                daemon=True,
                name="DiscreteAppThread"
            )
            self.app_thread.start()

            # --- Setup hotkey listener AFTER starting the thread ---
            self.setup_hotkey_listener()
            # --- End Setup hotkey listener ---

            self.status_changed.emit(f"Application thread started. Listening for '{self._hotkey_str}'.")
            return True

        except Exception as e:
            error_msg = f"Failed to start application: {str(e)}"
            print(f"{error_msg}\n{traceback.format_exc()}") # Log detailed error
            self.error_occurred.emit(error_msg)
            self.status_changed.emit("Application failed to start.")
            self.stop_application() # Ensure cleanup if start fails
            return False

    def stop_application(self) -> None:
        """Stop the application background thread. Do NOT stop the hotkey listener here."""
        stopped_thread = False
        # --- Signal and stop the background thread ---
        if self.app_thread and self.app_thread.is_alive():
            print("Signaling background application thread to stop...")
            if hasattr(self, '_stop_app_thread_event'):
                self._stop_app_thread_event.set()
            if self.app_instance:
                if hasattr(self.app_instance, "stop_recording_event"):
                    self.app_instance.stop_recording_event.set()
                if hasattr(self.app_instance, "stop_application_event"):
                    self.app_instance.stop_application_event.set()
            print("Waiting for background application thread to join...")
            self.app_thread.join(timeout=2.0)
            if self.app_thread.is_alive():
                print("Warning: Background application thread did not exit cleanly.")
            else:
                print("Background application thread joined.")
                stopped_thread = True
            self.app_thread = None
            self.app_instance = None
        else:
            print("No background application thread to stop.")

        # Multiprocessing cleanup
        import multiprocessing
        try:
            multiprocessing.active_children()
        except Exception as e:
            print(f"Error cleaning up multiprocessing children: {e}")

        if stopped_thread:
            self.status_changed.emit("Application stopped")

    def restart_application(self) -> bool:
        """Restart the application with current settings"""
        self.status_changed.emit("Restarting application...")
        self.stop_application()
        # Add a small delay to ensure resources are released if needed
        # time.sleep(0.2)
        return self.start_application()

    def _run_application_thread(self, config: Dict[str, Any], stop_event: threading.Event) -> None:
        """
        Internal method executed in the background thread.
        Initializes and runs the DiscreteAudioApplication.
        """
        try:
            print("Background thread started.")
            # Configure container within the thread using the passed config
            self.container.config.from_dict(config)

            # Create application instance within the thread
            self.app_instance = self.container.application()

            # Pass the stop event to the app instance
            self.app_instance.stop_recording_event = stop_event

            print("Starting DiscreteAudioApplication.run() in background thread...")
            
            # Run the application - it has its own event loop that will continue running
            # until the stop_event is set
            self.app_instance.run()

        except Exception as e:
            error_msg = f"Background Application Error: {str(e)}\n{traceback.format_exc()}"
            print(error_msg)
            # Use signal to report error back to the main thread's UI
            self.error_occurred.emit(f"Background Thread Error: {str(e)}")
            self.status_changed.emit("Application error occurred")
        finally:
            print("Background application thread finished.")
            # Clear the instance reference from the manager when the thread truly exits
            self.app_instance = None


    # --- New methods for hotkey handling ---
    def setup_hotkey_listener(self) -> None:
        """
        Sets up the global hotkey listener ONCE.
        """
        if not _pynput_available:
            print("Cannot setup listener: Pynput not available.")
            return
        if self._listener_started:
            print("Hotkey listener already started (singleton).")
            return
        if not self._target_hotkey:
            print(f"Cannot setup listener: Invalid hotkey '{self._hotkey_str}'.")
            self.error_occurred.emit(f"Invalid hotkey '{self._hotkey_str}', listener disabled.")
            return

        print(f"Setting up hotkey listener for: {self._hotkey_str} ({self._target_hotkey}) on main thread.")
        try:
            self.hotkey_listener = keyboard.Listener(on_press=self._on_keyboard_press)
            self.hotkey_listener.start()
            self._listener_started = True
            print(f"Hotkey listener started successfully for '{self._hotkey_str}'.")
            self.status_changed.emit(f"Listening for hotkey '{self._hotkey_str}'...")
        except Exception as e:
            error_msg = f"Failed to start hotkey listener: {e}"
            print(f"{error_msg}\n{traceback.format_exc()}")
            self.error_occurred.emit(error_msg + " (Check Accessibility/Input Monitoring permissions)")
            self.status_changed.emit("Hotkey listener failed to start!")
            self.hotkey_listener = None

    def _on_keyboard_press(self, key: Union[keyboard.Key, keyboard.KeyCode, None]) -> None:
        """
        Internal callback for pynput listener. Runs in pynput's thread.
        Emits a Qt signal to be handled on the main thread.
        """
        # Always check the current target hotkey (which may change)
        if key == self._target_hotkey:
            self.hotkey_pressed.emit(self._hotkey_str)

    @pyqtSlot(str)
    def _handle_hotkey_press(self, hotkey_name: str) -> None:
        """
        Handles the hotkey_pressed signal. Runs on the main Qt thread.
        Checks application state and queues the start recording action
        on the background application's queue.
        """
        timestamp = time.strftime('%H:%M:%S')
        # Check if the background application instance exists and is running
        if not self.app_instance or not self.app_thread or not self.app_thread.is_alive():
            print(f"[{timestamp}] Hotkey '{hotkey_name}' detected, but application is not running.")
            # Optional: Provide user feedback (e.g., system beep or UI status)
            self.status_changed.emit("Hotkey ignored: Application not running.")
            return

        # Access state flags from app_instance carefully.
        # Reading bool flags might be okay without locks if updates are infrequent
        # and handled carefully within the app_instance's locks.
        # If issues arise, use thread-safe getters or put status checks on the queue too.
        try:
            is_currently_processing = self.app_instance.is_processing
            is_currently_recording = self.app_instance.is_recording
        except AttributeError:
             # app_instance might be in a state of flux during startup/shutdown
             print(f"[{timestamp}] Hotkey '{hotkey_name}' detected, but app instance state inaccessible.")
             return


        # Prevent queuing multiple start actions if already busy
        if is_currently_processing:
            print(f"[{timestamp}] Hotkey '{hotkey_name}' detected, but PROCESSING is busy.")
            # self.status_changed.emit("Processing busy, please wait...") # Optional UI feedback
            return
        if is_currently_recording:
            print(f"[{timestamp}] Hotkey '{hotkey_name}' detected, but already RECORDING.")
            # self.status_changed.emit("Already recording...") # Optional UI feedback
            return

        print(f"[{timestamp}] Hotkey '{hotkey_name}' detected by manager. Queuing action for background app.")
        # Safely put the action onto the background thread's queue
        try:
             self.app_instance.action_queue.put(_ACTION_START_RECORDING)
             self.status_changed.emit("Hotkey pressed, initiating command...") # Update UI
        except AttributeError:
             print(f"[{timestamp}] Error: Cannot queue action, app_instance or action_queue missing.")
        except Exception as e:
             print(f"[{timestamp}] Error queuing action: {e}")
             self.error_occurred.emit(f"Error sending action to background app: {e}")

    # --- End new methods ---

    def validate_settings(self, new_settings: Dict[str, Any]) -> tuple[bool, str]:
        """Validate new settings and return (is_valid, error_message)"""
        # (Keep this method as is)
        try:
            # Check OpenAI settings
            if not new_settings['OpenAI']['api_key']:
                return False, "OpenAI API key is required"

            # Check ASR settings
            if new_settings['ASR']['source'] not in ['faster_whisper', 'whisper-1']:
                return False, "Invalid ASR source"

            # Check LLM settings
            if new_settings['LLM']['source'] not in ['ollama', 'openai_api']:
                return False, "Invalid LLM source"

            # Check Audio settings
            if not (8000 <= new_settings['Audio']['sample_rate'] <= 48000):
                return False, "Invalid sample rate"
            if not (1 <= new_settings['Audio']['channels'] <= 2):
                return False, "Invalid number of channels"

            # Check Hotkey settings
            hotkey = new_settings.get('Hotkeys', {}).get('start_recording_hotkey')
            if not hotkey:
                 return False, "Start Recording Hotkey cannot be empty."
            # Further validation could parse the hotkey string here if needed

            return True, ""

        except KeyError as e:
             return False, f"Missing setting section/key: {e}"
        except Exception as e:
            return False, f"Settings validation error: {str(e)}"

    def close_hotkey_listener(self) -> None:
        """Call this ONCE on final shutdown to stop the listener."""
        if self.hotkey_listener:
            print("Stopping hotkey listener (final shutdown)...")
            try:
                if self.hotkey_listener.running:
                    self.hotkey_listener.stop()
                    self.hotkey_listener.join(timeout=1.0)
                print("Hotkey listener stopped.")
            except Exception as e:
                print(f"Error stopping hotkey listener: {e}")
            self.hotkey_listener = None
            self._listener_started = False
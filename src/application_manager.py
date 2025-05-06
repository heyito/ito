# application_manager.py
import pathlib
import queue
import threading
import time
import traceback
from typing import Any

from PyQt6.QtCore import QObject, QSettings, pyqtSignal, pyqtSlot

from src.application_interface import ApplicationInterface
from src.containers import Container
from src.ui.keyboard_manager import KeyboardManager

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
        self.app_thread: threading.Thread | None = None
        self.app_instance: ApplicationInterface | None = None
        self.error_queue = queue.Queue()
        self.status_queue = queue.Queue()

        # Get keyboard manager instance and connect to its signal
        self.keyboard_manager = KeyboardManager.instance()
        self.keyboard_manager.hotkey_pressed.connect(self._handle_hotkey_press)

        # Load initial settings
        self.load_settings()

    def load_settings(self) -> dict[str, Any]:
        """Load settings from QSettings and convert to config format"""
        config = {}

        # OpenAI settings
        config['OpenAI'] = {
            'api_key': self.settings.value("OpenAI/api_key", ""),
            'model': self.settings.value("OpenAI/model", "gpt-4.1")
        }

        # ASR settings
        config['ASR'] = {
            'source': self.settings.value("ASR/source", "openai_api"),
            'model': self.settings.value("ASR/model", "whisper-1"),
            'local_model_size': self.settings.value("ASR/local_model_size", "base.en"),
            'device': self.settings.value("ASR/device", "auto"),
            'compute_type': self.settings.value("ASR/compute_type", "default")
        }

        # LLM settings
        config['LLM'] = {
            'source': self.settings.value("LLM/source", "openai_api"),
            'model': self.settings.value("LLM/model", "gpt-4.1"),
            'max_tokens': int(self.settings.value("LLM/max_tokens", 2000)),
            'temperature': float(self.settings.value("LLM/temperature", 0.7))
        }

        # Audio settings
        config['Audio'] = {
            'sample_rate': int(self.settings.value("Audio/sample_rate", 16000)),
            'channels': int(self.settings.value("Audio/channels", 1))
        }

        # VAD settings - Convert string to boolean properly
        vad_enabled = self.settings.value("VAD/enabled", "True")
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

        # --- Vosk settings --- 
        # Calculate default path inside the method
        default_vosk_model_dir = "src/models/vosk-model-en-us-0.22-lgraph" # Adjust if needed
        current_file_path = pathlib.Path(__file__).resolve()
        project_root = current_file_path.parent.parent
        default_vosk_model_path_str = str(project_root / default_vosk_model_dir)
        
        # Read from QSettings, check if empty, apply calculated default if needed
        vosk_path_from_settings = self.settings.value("Vosk/model_path", "")
        final_vosk_path = vosk_path_from_settings if vosk_path_from_settings else default_vosk_model_path_str
        config['Vosk'] = {
            'model_path': final_vosk_path
        }

        # Output settings
        config['Output'] = {
            'method': self.settings.value("Output/method", "typewrite")
        }

        # Hotkey settings
        config['Hotkeys'] = {
            'start_recording_hotkey': self.settings.value("Hotkeys/start_recording_hotkey", "f9")
        }

        # Mode settings
        config['Mode'] = {
            'streaming': str(self.settings.value("Mode/streaming", "false")).lower()  # Convert to string and lowercase
        }

        # Set the hotkey in the keyboard manager
        self.keyboard_manager.set_hotkey(config['Hotkeys']['start_recording_hotkey'])

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
            new_hotkey = new_settings.get('Hotkeys', {}).get('start_recording_hotkey')
            if new_hotkey:
                self.keyboard_manager.set_hotkey(new_hotkey)

            # If application is running, restart it to apply new settings
            if self.app_thread and self.app_thread.is_alive():
                self.status_changed.emit("Settings saved. Restarting application...")
                self.restart_application()
            else:
                self.status_changed.emit("Settings saved.")

            return True

        except Exception as e:
            error_msg = f"Failed to save settings: {str(e)}"
            print(f"{error_msg}\n{traceback.format_exc()}")
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

            # Load current settings
            config = self.load_settings()
            is_valid, error_msg = self.validate_settings(config)
            if not is_valid:
                self.error_occurred.emit(f"Invalid settings, cannot start: {error_msg}")
                return False

            # Check if keyboard manager has a valid hotkey
            if not self.keyboard_manager._target_hotkey:
                self.error_occurred.emit("Invalid or unsupported hotkey. Cannot start listener.")
                return False

            # Create a new stop event for the thread
            self._stop_app_thread_event = threading.Event()

            # Start application in a separate thread
            self.status_changed.emit("Starting background application thread...")
            self.app_thread = threading.Thread(
                target=self._run_application_thread,
                args=(config, self._stop_app_thread_event),
                daemon=True,
                name="DiscreteAppThread"
            )
            self.app_thread.start()

            # Start status queue monitor thread
            self._start_status_queue_monitor()

            self.status_changed.emit("Application thread started. Listening for hotkey.")
            return True

        except Exception as e:
            error_msg = f"Failed to start application: {str(e)}"
            print(f"{error_msg}\n{traceback.format_exc()}")
            self.error_occurred.emit(error_msg)
            self.status_changed.emit("Application failed to start.")
            self.stop_application()
            return False

    def stop_application(self) -> None:
        """Stop the application background thread."""
        print("Initiating application stop sequence...")
        stopped_thread = False
        
        # Signal and stop the background thread
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
            self.app_thread.join(timeout=2.0)  # Increased timeout
            if self.app_thread.is_alive():
                print("Warning: Background application thread did not exit cleanly.")
            else:
                print("Background application thread joined.")
                stopped_thread = True
            self.app_thread = None
            self.app_instance = None
        else:
            print("No background application thread to stop.")

        # Stop asyncio loop if streaming mode might have used it
        if hasattr(self.container, 'asyncio_loop_manager'):
             print("Stopping asyncio loop manager...")
             self.container.asyncio_loop_manager().stop_loop()

        # Clear queues
        print("Clearing queues...")
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

        # Multiprocessing cleanup
        import multiprocessing
        try:
            print("Cleaning up multiprocessing resources...")
            # Get all active children
            children = multiprocessing.active_children()
            if children:
                print(f"Found {len(children)} active multiprocessing children")
                # Try to terminate them gracefully
                for child in children:
                    try:
                        child.terminate()
                        child.join(timeout=1.0)
                    except Exception as e:
                        print(f"Error terminating child process: {e}")
        except Exception as e:
            print(f"Error cleaning up multiprocessing children: {e}")

        if stopped_thread:
            self.status_changed.emit("Application stopped")
            print("Application stop sequence complete.")

    def closeEvent(self, event):
        """Handle window close event"""
        print("ApplicationManager closeEvent: Stopping application...")
        self.stop_application() # This now stops asyncio loop too
        # Clean up keyboard manager
        print("ApplicationManager closeEvent: Cleaning up keyboard manager...")
        self.keyboard_manager.cleanup()
        # Optional: Explicitly shutdown container resources if needed
        # print("ApplicationManager closeEvent: Shutting down container...")
        # self.container.shutdown_resources() # If using resource providers
        print("ApplicationManager closeEvent: Calling super...")
        super().closeEvent(event)
        print("ApplicationManager closeEvent: Finished.")
    
    def restart_application(self) -> bool:
        """Restart the application with current settings"""
        self.status_changed.emit("Restarting application...")
        self.stop_application()
        # Add a small delay to ensure resources are released if needed
        # time.sleep(0.2)
        return self.start_application()

    def _run_application_thread(self, config: dict[str, Any], stop_event: threading.Event) -> None:
        """
        Internal method executed in the background thread.
        Initializes and runs the DiscreteAudioApplication.
        """
        try:
            print("Background thread started.")
            print(f"DEBUG: stop_event.is_set() at thread start: {stop_event.is_set()}")
            # Configure container within the thread using the passed config
            self.container = Container()  # Create a new container instance
            self.container.config.from_dict(config)
            self.app_instance = self.container.application()

            # Pass the stop event to the app instance
            self.app_instance.stop_recording_event = stop_event

            # Pass the status queue to the app instance
            self.app_instance.status_queue = self.status_queue  # <--- Add this line

            print("Starting DiscreteAudioApplication.run() in background thread...")
            # Run the application - it has its own event loop that will continue running
            # until the stop_event is set
            self.app_instance.run()
            print("DEBUG: DiscreteAudioApplication.run() exited normally.")

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

    def _on_keyboard_press(self, key: keyboard.Key | keyboard.KeyCode | None) -> None:
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

        print(f"[{timestamp}] Hotkey '{hotkey_name}' detected by manager. Queuing action for background app.")
        # Safely put the action onto the background thread's queue
        try:
             self.app_instance.trigger_interaction()
             self.status_changed.emit("Hotkey pressed, initiating command...") # Update UI
        except AttributeError:
             print(f"[{timestamp}] Error: Cannot queue action, app_instance or action_queue missing.")
        except Exception as e:
             print(f"[{timestamp}] Error queuing action: {e}")
             self.error_occurred.emit(f"Error sending action to background app: {e}")

    # --- End new methods ---

    def validate_settings(self, new_settings: dict[str, Any]) -> tuple[bool, str]:
        """Validate new settings and return (is_valid, error_message)"""
        # (Keep this method as is)
        try:
            # Check OpenAI settings
            if not new_settings['OpenAI']['api_key']:
                return False, "OpenAI API key is required"

            # Check ASR settings
            if new_settings['ASR']['source'] not in ['openai_api', 'faster_whisper']:
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
                    print(f"Status queue monitor error: {e}")
                    break
        t = threading.Thread(target=monitor, daemon=True, name="StatusQueueMonitor")
        t.start()

    def closeEvent(self, event):
        """Handle window close event"""
        self.stop_application()
        # Clean up keyboard manager
        self.keyboard_manager.cleanup()
        super().closeEvent(event)
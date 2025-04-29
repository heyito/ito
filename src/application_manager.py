from PyQt6.QtCore import QObject, pyqtSignal, QSettings
from src.containers import Container
from src.discrete_audio_application import DiscreteAudioApplication
import threading
import queue
import traceback
from typing import Dict, Any, Optional

class ApplicationManager(QObject):
    # Signals for UI updates
    error_occurred = pyqtSignal(str)  # Emits error messages
    status_changed = pyqtSignal(str)  # Emits status updates
    settings_changed = pyqtSignal()   # Emits when settings are updated
    
    def __init__(self, organization_name: str, application_name: str):
        super().__init__()
        self.organization_name = organization_name
        self.application_name = application_name
        self.settings = QSettings(organization_name, application_name)
        
        self.container = Container()
        self.app_thread: Optional[threading.Thread] = None
        self.app_instance: Optional[DiscreteAudioApplication] = None
        self.error_queue = queue.Queue()
        
        # Load initial settings
        self.load_settings()
        
    def load_settings(self) -> Dict[str, Any]:
        """Load settings from QSettings and convert to config format"""
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
        
        return config
        
    def save_settings(self, new_settings: Dict[str, Any]) -> bool:
        """Save settings to QSettings and update application if running"""
        try:
            # Save each section
            for section, values in new_settings.items():
                for key, value in values.items():
                    self.settings.setValue(f"{section}/{key}", value)
            
            self.settings.sync()
            self.settings_changed.emit()
            
            # If application is running, update it
            if self.app_thread and self.app_thread.is_alive():
                self.restart_application()
                
            return True
            
        except Exception as e:
            self.error_occurred.emit(f"Failed to save settings: {str(e)}")
            return False
            
    def start_application(self) -> bool:
        """Start the application with current settings"""
        try:
            # Stop any existing application
            self.stop_application()
            
            # Load current settings
            config = self.load_settings()
            
            # Configure container
            self.container.config.from_dict(config)
            
            # Start application in a separate thread
            self.app_thread = threading.Thread(
                target=self._run_application,
                daemon=True
            )
            self.app_thread.start()
            
            self.status_changed.emit("Application started")
            return True
            
        except Exception as e:
            self.error_occurred.emit(f"Failed to start application: {str(e)}")
            return False
            
    def stop_application(self) -> None:
        """Stop the application if running"""
        if self.app_thread and self.app_thread.is_alive():
            if self.app_instance:
                self.app_instance.stop_recording_event.set()
            self.app_thread.join(timeout=5.0)
            self.app_thread = None
            self.app_instance = None
            self.status_changed.emit("Application stopped")
            
    def restart_application(self) -> bool:
        """Restart the application with current settings"""
        self.stop_application()
        return self.start_application()
        
    def _run_application(self) -> None:
        """Internal method to run the application"""
        try:
            # Load current settings first
            config = self.load_settings()
            
            # Validate settings before starting
            is_valid, error_msg = self.validate_settings(config)
            if not is_valid:
                self.error_occurred.emit(f"Invalid settings: {error_msg}")
                self.status_changed.emit("Application failed to start")
                return
                
            # Configure container
            self.container.config.from_dict(config)
            
            # Create and run application instance
            self.app_instance = self.container.application()
            self.app_instance.run()
            
        except Exception as e:
            error_msg = f"Application error: {str(e)}\n{traceback.format_exc()}"
            print(error_msg)  # Print full error to console for debugging
            self.error_occurred.emit(error_msg)
            self.status_changed.emit("Application error occurred")
            
    def validate_settings(self, new_settings: Dict[str, Any]) -> tuple[bool, str]:
        """Validate new settings and return (is_valid, error_message)"""
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
                
            return True, ""
            
        except Exception as e:
            return False, f"Settings validation error: {str(e)}" 
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                            QFormLayout, QLineEdit, QComboBox, QSpinBox, 
                            QPushButton, QCheckBox)
from PyQt6.QtCore import Qt
import configparser
import sys
import os

class SettingsWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Inten Settings")
        self.setMinimumWidth(400)
        
        # Main widget and layout
        main_widget = QWidget()
        self.setCentralWidget(main_widget)
        layout = QVBoxLayout(main_widget)
        form_layout = QFormLayout()
        
        # OpenAI Settings
        self.api_key = QLineEdit()
        self.api_key.setEchoMode(QLineEdit.EchoMode.Password)
        form_layout.addRow("OpenAI API Key:", self.api_key)
        
        # ASR Settings
        self.asr_provider = QComboBox()
        self.asr_provider.addItems(["openai_api", "faster_whisper"])
        form_layout.addRow("ASR Provider:", self.asr_provider)
        
        self.asr_model = QLineEdit()
        form_layout.addRow("ASR Model:", self.asr_model)
        
        # LLM Settings
        self.llm_provider = QComboBox()
        self.llm_provider.addItems(["openai_api"])
        form_layout.addRow("LLM Provider:", self.llm_provider)
        
        self.llm_model = QLineEdit()
        form_layout.addRow("LLM Model:", self.llm_model)
        
        # Audio Settings
        self.sample_rate = QSpinBox()
        self.sample_rate.setRange(8000, 48000)
        self.sample_rate.setValue(16000)
        form_layout.addRow("Sample Rate:", self.sample_rate)
        
        # VAD Settings
        self.vad_enabled = QCheckBox()
        form_layout.addRow("VAD Enabled:", self.vad_enabled)
        
        self.vad_silence = QSpinBox()
        self.vad_silence.setRange(500, 5000)
        self.vad_silence.setValue(1500)
        form_layout.addRow("Silence Duration (ms):", self.vad_silence)
        
        # Hotkey Settings
        self.hotkey = QLineEdit()
        form_layout.addRow("Recording Hotkey:", self.hotkey)
        
        layout.addLayout(form_layout)
        
        # Save Button
        save_btn = QPushButton("Save Settings")
        save_btn.clicked.connect(self.save_settings)
        layout.addWidget(save_btn)
        
        # Load existing settings
        self.load_settings()

    def load_settings(self):
        config = configparser.ConfigParser()
        if os.path.exists('config.ini'):
            config.read('config.ini')
            
            # Load values from config
            self.api_key.setText(config.get('OpenAI', 'api_key', fallback=''))
            self.asr_provider.setCurrentText(config.get('ASR', 'provider', fallback='openai_api'))
            self.asr_model.setText(config.get('ASR', 'model', fallback='whisper-1'))
            self.llm_provider.setCurrentText(config.get('LLM', 'provider', fallback='openai_api'))
            self.llm_model.setText(config.get('LLM', 'model', fallback='gpt-3.5-turbo'))
            self.sample_rate.setValue(config.getint('Audio', 'sample_rate', fallback=16000))
            self.vad_enabled.setChecked(config.getboolean('VAD', 'enabled', fallback=False))
            self.vad_silence.setValue(config.getint('VAD', 'silence_duration_ms', fallback=1500))
            self.hotkey.setText(config.get('Hotkeys', 'start_recording_hotkey', fallback='cmd+shift+r'))

    def save_settings(self):
        config = configparser.ConfigParser()
        
        # OpenAI section
        config['OpenAI'] = {
            'api_key': self.api_key.text()
        }
        
        # ASR section
        config['ASR'] = {
            'provider': self.asr_provider.currentText(),
            'model': self.asr_model.text()
        }
        
        # LLM section
        config['LLM'] = {
            'provider': self.llm_provider.currentText(),
            'model': self.llm_model.text()
        }
        
        # Audio section
        config['Audio'] = {
            'sample_rate': str(self.sample_rate.value()),
            'channels': '1'
        }
        
        # VAD section
        config['VAD'] = {
            'enabled': str(self.vad_enabled.isChecked()),
            'silence_duration_ms': str(self.vad_silence.value()),
            'aggressiveness': '1',
            'frame_duration_ms': '30'
        }
        
        # Output section
        config['Output'] = {
            'method': 'direct'
        }
        
        # Hotkeys section
        config['Hotkeys'] = {
            'start_recording_hotkey': self.hotkey.text()
        }
        
        # Save to file
        with open('config.ini', 'w') as configfile:
            config.write(configfile)

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = SettingsWindow()
    window.show()
    sys.exit(app.exec()) 
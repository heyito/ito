import os
import sys
import traceback

from PyQt6.QtCore import QPointF, QSettings, Qt, QTimer
from PyQt6.QtGui import QPixmap
from PyQt6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDoubleSpinBox,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListView,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QScrollBar,
    QSpinBox,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
    QFrame,
)

from src.application_manager import ApplicationManager
from src.ui.onboarding import OnboardingWindow
from src.ui.components.inten_layout import IntenLayout

# --- Platform specific code for macOS ---
_ns_window = None
if sys.platform == 'darwin':
    try:
        from ctypes import c_void_p

        import objc
        from AppKit import (
            NSColor,
            NSFullSizeContentViewWindowMask,
            NSView,
            NSWindow,
            NSWindowTitleHidden,
        )
        print("PyObjC found. Applying native macOS styling.")
        _objc_available = True
    except ImportError:
        print("PyObjC framework (pyobjc-framework-Cocoa) not found. Cannot apply native macOS styling.")
        _objc_available = False
else:
    _objc_available = False

class CustomCombo(QComboBox):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # use a pure-Qt list view so CSS works end-to-end
        view = QListView(self)
        view.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.setView(view)

    def showPopup(self):
        # grab the popup window (a QFrame in its own NSWindow)
        popup = self.view().window()
        if popup:
            # find & hide any scrollbars Cocoa might have injected
            for sb in popup.findChildren(QScrollBar):
                sb.hide()

            # zero out margins just in case
            if popup.layout():
                popup.layout().setContentsMargins(0,0,0,0)
            popup.setContentsMargins(0,0,0,0)

            popup.setStyleSheet("""
                QWidget#comboPopup {
                    background-color: white;
                    border: 1px solid #E5E5EA;
                }
            """)

        super().showPopup()

class HomeWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setWindowFlags(self.windowFlags() | Qt.WindowType.FramelessWindowHint)
        self.setWindowTitle("Inten")
        self.setMinimumWidth(900)
        self.setMinimumHeight(600)

        # Initialize ApplicationManager
        self.app_manager = ApplicationManager(
            OnboardingWindow.ORGANIZATION_NAME,
            OnboardingWindow.APPLICATION_NAME
        )
        
        # Connect signals
        self.app_manager.error_occurred.connect(self.handle_error)
        self.app_manager.status_changed.connect(self.handle_status_change)
        self.app_manager.settings_changed.connect(self.load_settings)
        
        # Show status window
        if hasattr(self.app_manager, 'status_window'):
            self.app_manager.status_window.show()
        
        # Add these variables for dragging functionality
        self._dragging = False
        self._drag_start_position = QPointF()
        self._effective_top_margin = 40  # Same as onboarding window

        # Apply native macOS styling
        if _objc_available:
            try:
                view_id_sip = self.winId()
                view_address = int(view_id_sip)
                view_ptr = c_void_p(view_address)
                ns_view = objc.objc_object(c_void_p=view_ptr)
                global _ns_window
                _ns_window = ns_view.window()

                if _ns_window:
                    _ns_window.setTitlebarAppearsTransparent_(True)
                    _ns_window.setStyleMask_(_ns_window.styleMask() | NSFullSizeContentViewWindowMask)
                else:
                    print("Warning: Could not get NSWindow object.")
            except Exception as e:
                print(f"Error applying native styling: {e}")

        # Main widget and layout
        main_widget = IntenLayout(self, radius=8, show_close_button=True)
        main_widget.setObjectName("main_widget")
        self.setCentralWidget(main_widget)
        main_layout = QHBoxLayout()
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)
        main_widget.layout.addLayout(main_layout)
        self._effective_top_margin = main_widget.get_effective_top_margin()
        main_widget.layout.setContentsMargins(40, self._effective_top_margin, 40, 40)
        main_widget.layout.setSpacing(20)

        # Left menu panel
        menu_panel = QWidget()
        menu_panel.setObjectName("menu_panel")  # Add object name for styling
        menu_panel.setFixedWidth(220)
        menu_layout = QVBoxLayout(menu_panel)
        menu_layout.setContentsMargins(0, 0, 0, 0)
        menu_layout.setSpacing(0)

        # Logo container at the top of menu
        logo_container = QWidget()
        logo_container.setFixedHeight(64)
        logo_layout = QHBoxLayout(logo_container)
        logo_layout.setContentsMargins(0, 0, 0, 0)

        # Center container for logo and name
        center_container = QWidget()
        center_layout = QHBoxLayout(center_container)
        center_layout.setContentsMargins(0, 0, 0, 0)
        center_layout.setSpacing(12)

        # Logo
        logo_label = QLabel()
        # Try to load logo from multiple possible locations
        logo_paths = [
            "inten-logo.png",  # Development path
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "inten-logo.png"),  # Production path
        ]
        logo_pixmap = None
        for path in logo_paths:
            if os.path.exists(path):
                logo_pixmap = QPixmap(path)
                if not logo_pixmap.isNull():
                    break
        
        if logo_pixmap and not logo_pixmap.isNull():
            scaled_pixmap = logo_pixmap.scaled(32, 32, Qt.AspectRatioMode.KeepAspectRatio, 
                                             Qt.TransformationMode.SmoothTransformation)
            logo_label.setPixmap(scaled_pixmap)
        else:
            logo_label.setText("🎯")
        center_layout.addWidget(logo_label)

        # App name
        app_name = QLabel("Inten")
        app_name.setStyleSheet("font-size: 24px; font-weight: 600; color: #F2E4D6;")
        center_layout.addWidget(app_name)

        # Add the centered container to the main logo layout
        logo_layout.addWidget(center_container, alignment=Qt.AlignmentFlag.AlignCenter)
        menu_layout.addWidget(logo_container)

        # Menu buttons
        self.settings_button = QPushButton("Settings")
        self.settings_button.setObjectName("settings_button")
        self.settings_button.setCheckable(True)
        self.settings_button.setChecked(True)
        self.settings_button.clicked.connect(lambda: self.show_page(0))
        menu_layout.addWidget(self.settings_button)
        # Style the menu button for a soft, modern selection
        self.settings_button.setStyleSheet('''
            QPushButton#settings_button {
                background: rgba(242, 228, 214, 0.08) !important;
                color: #FFFFFF;
                font-size: 18px;
                font-weight: 500;
                border: none;
                border-radius: 8px;
                padding: 12px 0px;
                margin: 8px 16px 8px 16px;
            }
            QPushButton#settings_button:checked {
                background: rgba(242, 228, 214, 0.15) !important;
                color: #FFFFFF;
            }
            QPushButton#settings_button:hover {
                background: rgba(242, 228, 214, 0.1) !important;
            }
        ''')

        # Add stretch to push everything up
        menu_layout.addStretch()

        # Content area (no card background, just a container for layout)
        content_widget = QWidget()
        content_widget.setObjectName("content_widget")
        content_layout = QVBoxLayout(content_widget)
        content_layout.setContentsMargins(40, 44, 40, 40)
        content_widget.setStyleSheet("background: transparent; border: none;")

        # Stacked widget to handle different pages
        self.stacked_widget = QStackedWidget()
        content_layout.addWidget(self.stacked_widget)

        # Settings page
        self.settings_page = QWidget()
        settings_layout = QVBoxLayout(self.settings_page)
        settings_layout.setContentsMargins(0, 0, 0, 0)
        settings_title = QLabel("Settings")
        settings_title.setStyleSheet("""
            font-size: 24px;
            font-weight: 600;
            color: #F2E4D6;
            margin-bottom: 20px;
            border: none;
        """)
        settings_layout.addWidget(settings_title)

        # Create a scroll area for the settings form
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)

        scroll_content = QWidget()
        scroll_content.setObjectName("scroll_content")
        form_layout = QFormLayout(scroll_content)
        form_layout.setSpacing(16)
        form_layout.setContentsMargins(0, 0, 0, 0)
        form_layout.setLabelAlignment(Qt.AlignmentFlag.AlignLeft)
        form_layout.setFormAlignment(Qt.AlignmentFlag.AlignLeft)
        
        # OpenAI Section
        self.add_section_header(form_layout, "OpenAI Settings")
        self.openai_api_key = QLineEdit()
        self.openai_api_key.setMaximumWidth(300)
        self.openai_api_key.setStyleSheet("""
            QLineEdit {
                background-color: rgba(255, 255, 255, 0.07);
                padding: 8px 12px;
                border-radius: 8px;
            }
        """)
        openai_api_key_label = QLabel("API Key:")
        openai_api_key_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        openai_api_key_container = QWidget()
        openai_api_key_layout = QVBoxLayout(openai_api_key_container)
        openai_api_key_layout.setContentsMargins(0, 0, 0, 0)
        openai_api_key_layout.setSpacing(4)
        openai_api_key_layout.addWidget(openai_api_key_label)
        openai_api_key_layout.addWidget(self.openai_api_key)
        form_layout.addRow(openai_api_key_container)

        # ASR Section
        self.add_section_header(form_layout, "Speech Recognition Settings")
        self.asr_source = CustomCombo()
        self.asr_source.addItems(["openai_api", "faster_whisper"])
        self.asr_model = CustomCombo()
        self.asr_model.addItems(["whisper-1"])
        self.asr_local_model_size = CustomCombo()
        self.asr_local_model_size.addItems(["tiny", "tiny.en", "base", "base.en", "small", "small.en", 
                                          "medium", "medium.en", "large-v1", "large-v2", "large-v3"])
        self.asr_device = CustomCombo()
        self.asr_device.addItems(["auto"])
        self.asr_compute_type = CustomCombo()
        self.asr_compute_type.addItems(["default"])
        form_layout.addRow("ASR Provider:", self.asr_source)
        form_layout.addRow("Model:", self.asr_model)
        form_layout.addRow("Local Model Size:", self.asr_local_model_size)
        form_layout.addRow("Device:", self.asr_device)
        form_layout.addRow("Compute Type:", self.asr_compute_type)

        # --- NEW: Vosk Section --- 
        self.add_section_header(form_layout, "Vosk Settings (Streaming Mode)")
        self.vosk_model_path_edit = QLineEdit()
        self.vosk_model_path_edit.setMaximumWidth(300)
        self.vosk_model_path_edit.setStyleSheet("""
            QLineEdit {
                background-color: rgba(255, 255, 255, 0.07);
                padding: 8px 12px;
                border-radius: 8px;
            }
        """)
        vosk_model_path_label = QLabel("Model Path:")
        vosk_model_path_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        vosk_model_path_container = QWidget()
        vosk_model_path_layout = QVBoxLayout(vosk_model_path_container)
        vosk_model_path_layout.setContentsMargins(0, 0, 0, 0)
        vosk_model_path_layout.setSpacing(4)
        vosk_model_path_layout.addWidget(vosk_model_path_label)
        vosk_model_path_layout.addWidget(self.vosk_model_path_edit)
        form_layout.addRow(vosk_model_path_container)

        # LLM Section
        self.add_section_header(form_layout, "Language Model Settings")
        self.llm_source = CustomCombo()
        self.llm_source.addItems(["ollama", "openai_api"])
        self.llm_model = QLineEdit()
        self.llm_model.setMaximumWidth(300)
        self.llm_model.setStyleSheet("""
            QLineEdit {
                background-color: rgba(255, 255, 255, 0.07);
                padding: 8px 12px;
                border-radius: 8px;
            }
        """)
        llm_model_label = QLabel("Model:")
        llm_model_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        llm_model_container = QWidget()
        llm_model_layout = QVBoxLayout(llm_model_container)
        llm_model_layout.setContentsMargins(0, 0, 0, 0)
        llm_model_layout.setSpacing(4)
        llm_model_layout.addWidget(llm_model_label)
        llm_model_layout.addWidget(self.llm_model)
        self.max_tokens = QSpinBox()
        self.max_tokens.setRange(1, 25000)
        self.max_tokens.setValue(2000)
        self.temperature = QDoubleSpinBox()
        self.temperature.setRange(0.0, 1.0)
        self.temperature.setSingleStep(0.1)
        self.temperature.setValue(0.7)
        form_layout.addRow("LLM Source:", self.llm_source)
        form_layout.addRow("Model:", self.llm_model)
        form_layout.addRow("Max Tokens:", self.max_tokens)
        form_layout.addRow("Temperature:", self.temperature)

        # Connect LLM source change to update model field
        self.llm_source.currentTextChanged.connect(self.update_llm_model_field)

        # Audio Section
        self.add_section_header(form_layout, "Audio Settings")
        self.sample_rate = QSpinBox()
        self.sample_rate.setRange(8000, 48000)
        self.sample_rate.setValue(16000)
        self.channels = QSpinBox()
        self.channels.setRange(1, 2)
        form_layout.addRow("Sample Rate:", self.sample_rate)
        form_layout.addRow("Channels:", self.channels)

        # VAD Section
        self.add_section_header(form_layout, "Voice Activity Detection")
        self.vad_enabled = QCheckBox()
        self.vad_aggressiveness = QSpinBox()
        self.vad_aggressiveness.setRange(0, 3)
        self.silence_duration = QSpinBox()
        self.silence_duration.setRange(100, 5000)
        self.silence_duration.setSingleStep(100)
        self.frame_duration = CustomCombo()
        self.frame_duration.addItems(["10", "20", "30"])
        form_layout.addRow("Enable VAD:", self.vad_enabled)
        form_layout.addRow("Aggressiveness:", self.vad_aggressiveness)
        form_layout.addRow("Silence Duration (ms):", self.silence_duration)
        form_layout.addRow("Frame Duration (ms):", self.frame_duration)

        # Output Section
        self.add_section_header(form_layout, "Output Settings")
        self.output_method = CustomCombo()
        self.output_method.addItems(["typewrite", "clipboard"])
        form_layout.addRow("Output Method:", self.output_method)

        # Mode Section
        self.add_section_header(form_layout, "Application Mode")
        self.streaming_mode = QCheckBox()
        self.streaming_mode.stateChanged.connect(self.update_setting_visibility)
        form_layout.addRow("Streaming Mode (Requires Vosk):", self.streaming_mode)

        # Hotkeys Section
        self.add_section_header(form_layout, "Hotkey Settings")
        self.start_recording_hotkey = QLineEdit()
        self.start_recording_hotkey.setMaximumWidth(300)
        self.start_recording_hotkey.setStyleSheet("""
            QLineEdit {
                background-color: rgba(255, 255, 255, 0.07);
                padding: 8px 12px;
                border-radius: 8px;
            }
        """)
        start_recording_hotkey_label = QLabel("Start Recording:")
        start_recording_hotkey_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        start_recording_hotkey_container = QWidget()
        start_recording_hotkey_layout = QVBoxLayout(start_recording_hotkey_container)
        start_recording_hotkey_layout.setContentsMargins(0, 0, 0, 0)
        start_recording_hotkey_layout.setSpacing(4)
        start_recording_hotkey_layout.addWidget(start_recording_hotkey_label)
        start_recording_hotkey_layout.addWidget(self.start_recording_hotkey)
        form_layout.addRow(start_recording_hotkey_container)

        # Set the scroll area widget
        scroll_area.setWidget(scroll_content)
        settings_layout.addWidget(scroll_area)

        # Button container for Save and Reset
        button_container = QWidget()
        button_layout = QHBoxLayout(button_container)
        button_layout.setContentsMargins(0, 20, 0, 0)

        # Save button
        save_button = QPushButton("Save Settings")
        save_button.setObjectName("btn-primary")
        save_button.setStyleSheet("""
            QPushButton#btn-primary {
                background-color: #F6EBDD;
                color: #181A2A;
                border: none; /* Crucial for macOS */
                border-radius: 8px;
                font-size: 16px;
                font-weight: 600;
                padding: 0 14px;
                min-height: 44px; /* You had 32px in styles, 44px in code */
                min-width: 160px;
                letter-spacing: 0.2px;
            }
            QPushButton#btn-primary:hover {
                background-color: #f3e2c7;
            }
        """)
        save_button.clicked.connect(self.save_settings)
        button_layout.addWidget(save_button)

        # Reset button
        reset_button = QPushButton("Reset All")
        reset_button.setObjectName("btn-primary")
        reset_button.setStyleSheet("""
            QPushButton#btn-primary {
                background-color: #F6EBDD;
                color: #181A2A;
                border: none; /* Crucial for macOS */
                border-radius: 8px;
                font-size: 16px;
                font-weight: 600;
                padding: 0 14px;
                min-height: 44px; /* You had 32px in styles, 44px in code */
                min-width: 160px;
                letter-spacing: 0.2px;
            }
            QPushButton#btn-primary:hover {
                background-color: #f3e2c7;
            }
        """)
        reset_button.clicked.connect(self.reset_all_settings)
        button_layout.addWidget(reset_button)
        button_layout.addStretch()

        settings_layout.addWidget(button_container)

        # Add settings page to stacked widget
        self.stacked_widget.addWidget(self.settings_page)

        # --- Menu panel and divider container ---
        menu_container = QWidget()
        menu_container_layout = QVBoxLayout(menu_container)
        menu_container_layout.setContentsMargins(0, 24, 0, 24)  # Add top/bottom margin
        menu_container_layout.setSpacing(0)
        menu_container_layout.addWidget(menu_panel)
        main_layout.addWidget(menu_container)
        main_layout.addWidget(content_widget)

        # Load settings after UI is fully initialized
        self.load_settings()
        self.update_setting_visibility()
        
        # Start application if settings are valid
        current_settings = self.app_manager.load_settings()
        if current_settings:  # Only validate if we have settings
            is_valid, error_msg = self.app_manager.validate_settings(current_settings)
            if is_valid:
                self.app_manager.start_application()
            else:
                self.handle_error(error_msg)

        # --- Unified Global Styles for Home Window ---
        self.setStyleSheet(self.styleSheet() + """
            QPushButton#btn-primary {
                background-color: #F6EBDD;
                color: #181A2A;
                border: none;
                border-radius: 14px;
                font-size: 16px;
                font-weight: 600;
                padding: 0 14px;
                min-height: 32px;
                min-width: 160px;
                letter-spacing: 0.2px;
            }
            QPushButton#btn-primary:hover {
                background-color: #f3e2c7;
            }
            QPushButton#btn-primary:disabled {
                background-color: #f3e2c7;
                color: #b0b0b0;
            }

            /* Menu button highlight (Settings) */
            QPushButton#settings_button {
                background: transparent;
                color: #F2E4D6;
                font-size: 18px;
                font-weight: 500;
                border: none;
                border-radius: 16px;
                padding: 12px 0px;
                margin: 8px 16px 8px 16px;
            }
            QPushButton#settings_button:checked {
                background: rgba(242, 228, 214, 0.32);
                color: #FFFFFF;
            }
            QPushButton#settings_button:hover {
                background: rgba(242, 228, 214, 0.28);
            }

            /* macOS-style scrollbar */
            QScrollBar:vertical {
                background: transparent;
                width: 10px;
                margin: 8px 2px 8px 2px;
                border-radius: 6px;
            }
            QScrollBar::handle:vertical {
                background: rgba(242, 228, 214, 0.25);
                min-height: 32px;
                border-radius: 6px;
                border: none;
            }
            QScrollBar::handle:vertical:hover {
                background: rgba(242, 228, 214, 0.38);
            }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
                height: 0px;
                background: none;
                border: none;
            }
            QScrollBar::add-page:vertical, QScrollBar::sub-page:vertical {
                background: none;
            }

            /* QComboBox and popup styling */
            QComboBox {
                background: rgba(30, 32, 40, 0.92);
                color: #F2E4D6;
                border: 1.5px solid rgba(242, 228, 214, 0.22);
                border-radius: 8px;
                padding: 6px 32px 6px 12px;
                font-size: 16px;
                min-width: 180px;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            }
            QComboBox QAbstractItemView {
                background: rgba(30, 32, 40, 0.98);
                color: #F2E4D6;
                border-radius: 10px;
                font-size: 16px;
                min-width: 220px;
                selection-background-color: rgba(242, 228, 214, 0.18);
                selection-color: #181A2A;
                outline: none;
            }
            QComboBox::drop-down {
                border: none;
                width: 32px;
                background: transparent;
            }
            QComboBox::down-arrow {
                image: none;
                width: 0;
                height: 0;
                border: none;
            }
        """)

    def show_page(self, index):
        self.stacked_widget.setCurrentIndex(index)

    def reset_all_settings(self):
        """Reset all settings and restart the onboarding process."""
        # Clear all settings
        settings = QSettings(OnboardingWindow.ORGANIZATION_NAME, OnboardingWindow.APPLICATION_NAME)
        settings.clear()
        settings.sync()  # Ensure settings are saved
        
        # Create and show new onboarding window
        self.onboarding_window = OnboardingWindow()
        self.onboarding_window.show()
        
        # Close the current window
        self.close()

    def add_section_header(self, layout, text):
        """Helper method to add styled section headers and a horizontal divider to the form"""
        # Add horizontal divider before each section except the first
        if layout.rowCount() > 0:
            divider = QFrame()
            divider.setFrameShape(QFrame.Shape.HLine)
            divider.setFixedHeight(1)
            divider.setStyleSheet("background: rgba(242, 228, 214, 0.3); border: none; margin-top: 16px; margin-bottom: 16px;")
            layout.addRow(divider)
        header = QLabel(text)
        header.setStyleSheet("""
            font-size: 15px;
            font-weight: 600;
            color: #F2E4D6;
            margin-top: 24px;
            margin-bottom: 8px;
            font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        """)
        layout.addRow(header)

    def handle_error(self, error_msg: str) -> None:
        """Handle error messages from ApplicationManager"""
        # Show error in message box if it's a critical error
        if "Failed to start application" in error_msg:
            QMessageBox.critical(
                self,
                "Application Error",
                f"Failed to start application:\n{error_msg}"
            )

    def handle_status_change(self, status: str) -> None:
        """Handle status updates from ApplicationManager"""
        pass  # Status is now handled by StatusWindow

    def save_settings(self):
        """Save all settings to QSettings"""
        try:
            llm_source_value = self.llm_source.currentText()
            llm_model_value = self.llm_model.text()
            vosk_model_path_value = self.vosk_model_path_edit.text()
            is_streaming = self.streaming_mode.isChecked()
            
            # Basic validation for Vosk path if streaming is enabled
            if is_streaming and not vosk_model_path_value:
                self.handle_error("Vosk Model Path cannot be empty when Streaming Mode is enabled.")
                return
                
            # Collect settings from UI
            new_settings = {
                'OpenAI': {
                    'api_key': self.openai_api_key.text(),
                    'model': llm_model_value if llm_source_value == "openai_api" else self.app_manager.load_settings().get("OpenAI", {}).get("model", "gpt-4.1"),
                },
                'Ollama': {
                    'model': llm_model_value if llm_source_value == "ollama" else self.app_manager.load_settings().get("Ollama", {}).get("model", "llama3.2:latest"),
                },
                'ASR': {
                    'source': self.asr_source.currentText(),
                    'model': self.asr_model.currentText(),
                    'local_model_size': self.asr_local_model_size.currentText(),
                    'device': self.asr_device.currentText(),
                    'compute_type': self.asr_compute_type.currentText()
                },
                'Vosk': {
                    'model_path': vosk_model_path_value
                },
                'LLM': {
                    'source': llm_source_value,
                    'model': llm_model_value,
                    'max_tokens': self.max_tokens.value(),
                    'temperature': self.temperature.value(),
                },
                'Audio': {
                    'sample_rate': self.sample_rate.value(),
                    'channels': self.channels.value(),
                },
                'VAD': {
                    'enabled': self.vad_enabled.isChecked(),
                    'aggressiveness': self.vad_aggressiveness.value(),
                    'silence_duration_ms': self.silence_duration.value(),
                    'frame_duration_ms': int(self.frame_duration.currentText()),
                },
                'Output': {
                    'method': self.output_method.currentText(),
                },
                'Hotkeys': {
                    'start_recording_hotkey': self.start_recording_hotkey.text(),
                },
                'Mode': {
                    'streaming': str(is_streaming).lower()
                }
            }
            
            # Validate new settings
            is_valid, error_msg = self.app_manager.validate_settings(new_settings)
            if not is_valid:
                self.handle_error(error_msg)
                return
                
            # Save settings
            if self.app_manager.save_settings(new_settings):
                # Find the save button and update its text
                for widget in self.findChildren(QPushButton):
                    if widget.text() == "Save Settings":
                        widget.setText("Saved")
                        # Create a timer to reset the text after 3 seconds
                        QTimer.singleShot(3000, lambda: widget.setText("Save Settings"))
                        break
                
                # Start application if not running
                if not self.app_manager.app_thread or not self.app_manager.app_thread.is_alive():
                    if not self.app_manager.start_application():
                        self.handle_error("Failed to start application after saving settings")
                        return
                
        except Exception as e:
            self.handle_error(f"Failed to save settings: {str(e)}")
            print(f"Error details: {traceback.format_exc()}")

    def load_settings(self):
        """Load settings from QSettings"""
        try:
            config = self.app_manager.load_settings()
            
            # Load OpenAI settings
            self.openai_api_key.setText(config['OpenAI']['api_key'])
            
            # Load ASR settings
            self.asr_source.setCurrentText(config['ASR']['source'])
            self.asr_model.setCurrentText(config['ASR']['model'])
            self.asr_local_model_size.setCurrentText(config['ASR']['local_model_size'])
            self.asr_device.setCurrentText(config['ASR']['device'])
            self.asr_compute_type.setCurrentText(config['ASR']['compute_type'])
            
            # Load LLM settings
            self.llm_source.setCurrentText(config['LLM']['source'])
            # Set model field based on LLM source
            if config['LLM']['source'] == "ollama":
                self.llm_model.setText(config.get("Ollama", {}).get("model", "llama3.2:latest"))
            else:
                self.llm_model.setText(config.get("OpenAI", {}).get("model", "gpt-4.1"))
            self.max_tokens.setValue(config['LLM']['max_tokens'])
            self.temperature.setValue(config['LLM']['temperature'])
            
            # Load Audio settings
            self.sample_rate.setValue(config['Audio']['sample_rate'])
            self.channels.setValue(config['Audio']['channels'])
            
            # Load VAD settings
            self.vad_enabled.setChecked(config['VAD']['enabled'])
            self.vad_aggressiveness.setValue(config['VAD']['aggressiveness'])
            self.silence_duration.setValue(config['VAD']['silence_duration_ms'])
            self.frame_duration.setCurrentText(str(config['VAD']['frame_duration_ms']))
            
            # Load Output settings
            self.output_method.setCurrentText(config['Output']['method'])
            
            # Load Hotkey settings
            self.start_recording_hotkey.setText(config['Hotkeys']['start_recording_hotkey'])

            # Load Mode settings
            mode_config = config.get('Mode', {}) 
            self.streaming_mode.setChecked(mode_config.get('streaming', 'false') == "true")
            
            # Load Vosk settings (Path is now guaranteed by ApplicationManager)
            vosk_config = config.get('Vosk', {}) 
            vosk_path_from_config = vosk_config.get('model_path') # Should always have a valid path now
            self.vosk_model_path_edit.setText(vosk_path_from_config if vosk_path_from_config else "") # Set text, handle potential None just in case
            
        except Exception as e:
            self.handle_error(f"Failed to load settings: {str(e)}")

    def closeEvent(self, event):
        """Handle window close event"""
        self.app_manager.stop_application()
        # Hide status window
        if hasattr(self.app_manager, 'status_window'):
            self.app_manager.status_window.hide()
        super().closeEvent(event)

    # Add these three event handlers at the end of the class
    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            if event.position().y() < self._effective_top_margin:
                self._dragging = True
                self._drag_start_position = event.globalPosition()
                event.accept()
                return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self._dragging and event.buttons() & Qt.MouseButton.LeftButton:
            delta = event.globalPosition() - self._drag_start_position
            self.move(self.pos() + delta.toPoint())
            self._drag_start_position = event.globalPosition()
            event.accept()
            return
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self._dragging = False
            event.accept()
            return
        super().mouseReleaseEvent(event)

    # Update form labels style
    def update_form_labels(self):
        for i in range(form_layout.rowCount()):
            label_item = form_layout.itemAt(i, QFormLayout.ItemRole.LabelRole)
            if label_item and label_item.widget():
                label = label_item.widget()
                if isinstance(label, QLabel) and not label.text().endswith("Settings"):
                    label.setStyleSheet("""
                        QLabel {
                            color: #8E8E93;
                            font-size: 13px;
                        }
                    """)

    def update_llm_model_field(self):
        """Update the model field based on the selected LLM source."""
        config = self.app_manager.load_settings()
        llm_source = self.llm_source.currentText()
        if llm_source == "ollama":
            self.llm_model.setText(config.get("Ollama", {}).get("model", "llama3.2:latest"))
        else:
            self.llm_model.setText(config.get("OpenAI", {}).get("model", "gpt-4.1"))

    def update_setting_visibility(self):
        """Show/hide settings based on other selections (e.g., streaming mode)."""
        is_streaming = self.streaming_mode.isChecked()
        
        # Find the Vosk model path row in the form layout and toggle visibility
        # Now self.settings_page should exist
        settings_form_layout = self.settings_page.findChild(QFormLayout)
        if not settings_form_layout:
            print("Error: Could not find QFormLayout within settings page in update_setting_visibility")
            return

        vosk_header_label = None
        vosk_path_label = None
        vosk_path_field = None
        
        for i in range(settings_form_layout.rowCount()):
            label_item = settings_form_layout.itemAt(i, QFormLayout.ItemRole.LabelRole)
            field_item = settings_form_layout.itemAt(i, QFormLayout.ItemRole.FieldRole)
            
            if label_item and label_item.widget() and isinstance(label_item.widget(), QLabel):
                label_widget = label_item.widget()
                if "Vosk Settings" in label_widget.text():
                    vosk_header_label = label_widget
                elif label_widget.text() == "Model Path:":
                    vosk_path_label = label_widget
                    if field_item and field_item.widget():
                        vosk_path_field = field_item.widget()
        
        # Toggle visibility of found widgets
        if vosk_header_label:
            vosk_header_label.setVisible(is_streaming)
        if vosk_path_label:
            vosk_path_label.setVisible(is_streaming)
        if vosk_path_field:
            vosk_path_field.setVisible(is_streaming)

        # Example: Hide ASR/LLM sections if streaming
        # You would need to find their labels/widgets similarly and call setVisible(not is_streaming)

        # You might want to hide/show other settings based on streaming mode too,
        # e.g., maybe disable ASR/LLM sections if streaming only does transcription.
        # Add similar logic here for other fields as needed.
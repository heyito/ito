import sys
from PyQt6.QtWidgets import (QApplication, QListView, QMainWindow, QWidget, QVBoxLayout, 
                           QLabel, QPushButton, QHBoxLayout, QStackedWidget,
                           QFormLayout, QLineEdit, QComboBox, QSpinBox, QCheckBox,
                           QScrollArea, QScrollBar, QDoubleSpinBox)
from PyQt6.QtCore import Qt, QPointF, QSettings
from PyQt6.QtGui import QPixmap
import platform
from src.ui.onboarding import OnboardingWindow
import os

# --- Platform specific code for macOS ---
_ns_window = None
if sys.platform == 'darwin':
    try:
        import objc
        from AppKit import NSWindow, NSView, NSColor, NSWindowTitleHidden, NSFullSizeContentViewWindowMask
        from ctypes import c_void_p
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
        self.setWindowTitle("Inten")
        self.setMinimumWidth(900)
        self.setMinimumHeight(600)

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

        # Add global stylesheet for macOS-style form elements
        self.setStyleSheet("""
            QMainWindow {
                background: white;
            }
            
            /* Base input styles - minimal styling */
            QLineEdit, QComboBox, QSpinBox, QDoubleSpinBox {
                border: 1px solid #E5E5EA;
                background: white;
                padding: 5px;
                min-width: 200px;
                color: #1C1C1E;
            }
            
            /* Remove all spin buttons */
            QSpinBox::up-button, QSpinBox::down-button,
            QDoubleSpinBox::up-button, QDoubleSpinBox::down-button {
                width: 0;
                height: 0;
                border: none;
                background: transparent;
            }
            
            /* ComboBox styling */
            QComboBox {
                border: 1px solid #E5E5EA;
                background: white;
                padding: 5px;
                min-width: 200px;
                color: #1C1C1E;
            }

            QComboBox::drop-down {
                border: none;
                width: 20px;
            }

            QComboBox::down-arrow {
                width: 8px;
                height: 8px;
                background: #8E8E93;
                border-radius: 4px;
            }
                                      /* Style the dropdown popup frame/container */
            /* This QFrame holds the QAbstractItemView */
            QComboBox QFrame {
                background-color: white;  /* Frame background */
                border: 1px solid #E5E5EA;/* Apply border here */
                margin: 0px;              /* No margin */
                padding: 0px;             /* No padding */
                border-image: none;       /* Optional: Uncomment if desperate to reset native look */
            }

            /* Style the list view *inside* the frame */
            QComboBox QListView {
                background-color: white; /* View background (can be white or transparent if frame bg works) */
                color: #1C1C1E;                /* Default text color */
                selection-background-color: #F2F2F7; /* Selection background */
                selection-color: #1C1C1E;           /* Selection text color */
                outline: 0px;                       /* No focus outline */
                border: none;                       /* View itself has NO border (it's on the QFrame) */
                padding: 0px;                       /* View itself has NO padding */
                margin: 0px;                        /* View itself has NO margin */
            }

            /* Style the viewport *within* the list view - Often needed! */
            QComboBox QListView::viewport {
                background-color: white;  /* Ensure viewport background is white */
                border: none;             /* Ensure viewport has no border */
                margin: 0px;
                padding: 0px;
            }

            /* Style individual items */
            QComboBox QListView::item {
                background-color: white; /* Use background-color consistently */
                color: #1C1C1E;
                border: none;
                padding: 5px;             /* Padding *within* each item text area */
                margin: 0px;              /* Ensure items don't have margins */
                min-height: 20px; /* Optional: Ensure items have a minimum height */
            }

            /* Style selected items */
            QComboBox QListView::item:selected {
                background-color: #F2F2F7;
                color: #1C1C1E;
            }
            
            /* Checkbox - minimal styling */
            QCheckBox {
                spacing: 8px;
                color: #1C1C1E;
            }
            
            /* Menu panel */
            QWidget#menu_panel {
                background-color: #F5F5F7;
            }
            
            /* Menu buttons - essential styling only */
            QPushButton#settings_button {
                text-align: left;
                padding: 8px 16px;
                border: none;
                background-color: transparent;
                color: #1C1C1E;
            }
            
            QPushButton#settings_button:checked {
                background-color: white;
                color: #0A84FF;
            }
            
            /* Action buttons - minimal styling */
            QPushButton#save_button, QPushButton#reset_button {
                padding: 8px 20px;
                border: none;
                border-radius: 6px;
                color: white;
            }
            
            QPushButton#save_button {
                background-color: #0A84FF;
            }
            
            QPushButton#reset_button {
                background-color: #FF3B30;
            }

            /* Form labels */
            QLabel {
                color: #1C1C1E;
            }

            /* Section headers */
            QLabel[isHeader="true"] {
                font-size: 15px;
                font-weight: 600;
                color: #1C1C1E;
                margin-top: 24px;
                margin-bottom: 8px;
            }

            /* Scroll area */
            QScrollArea {
                border: none;
                background: white;
            }

            QWidget#scroll_content {
                background: white;
            }
        """)

        # Main widget and layout
        main_widget = QWidget()
        main_layout = QHBoxLayout(main_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)
        self.setCentralWidget(main_widget)

        # Left menu panel
        menu_panel = QWidget()
        menu_panel.setObjectName("menu_panel")  # Add object name for styling
        menu_panel.setFixedWidth(220)
        menu_layout = QVBoxLayout(menu_panel)
        menu_layout.setContentsMargins(0, 0, 0, 0)
        menu_layout.setSpacing(0)

        # Logo container at the top of menu
        logo_container = QWidget()
        logo_container.setFixedHeight(80)
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
        center_layout.addWidget(app_name)

        # Add the centered container to the main logo layout
        logo_layout.addWidget(center_container, alignment=Qt.AlignmentFlag.AlignCenter)
        menu_layout.addWidget(logo_container)

        # Menu buttons
        self.settings_button = QPushButton("Settings")
        self.settings_button.setObjectName("settings_button")  # Add object name for styling
        self.settings_button.setCheckable(True)
        self.settings_button.setChecked(True)
        self.settings_button.clicked.connect(lambda: self.show_page(0))
        menu_layout.addWidget(self.settings_button)

        # Add stretch to push everything up
        menu_layout.addStretch()

        # Content area
        content_widget = QWidget()
        content_layout = QVBoxLayout(content_widget)
        content_layout.setContentsMargins(40, 40, 40, 40)

        # Stacked widget to handle different pages
        self.stacked_widget = QStackedWidget()
        content_layout.addWidget(self.stacked_widget)

        # Settings page
        settings_page = QWidget()
        settings_layout = QVBoxLayout(settings_page)
        settings_layout.setContentsMargins(0, 0, 0, 0)  # Remove default margins
        settings_title = QLabel("Settings")
        settings_title.setStyleSheet("""
            font-size: 24px;
            font-weight: 600;
            color: #1C1C1E;
            margin-bottom: 20px;
            border: none;
        """)
        settings_layout.addWidget(settings_title)

        # Create a scroll area for the settings form
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)

        scroll_content = QWidget()
        scroll_content.setObjectName("scroll_content")  # Add object name for styling
        form_layout = QFormLayout(scroll_content)
        form_layout.setSpacing(16)
        form_layout.setContentsMargins(0, 0, 24, 0)  # Add right margin for scroll bar
        form_layout.setLabelAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        form_layout.setFormAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
        
        # OpenAI Section
        self.add_section_header(form_layout, "OpenAI Settings")
        self.openai_api_key = QLineEdit()
        self.openai_api_key.setEchoMode(QLineEdit.EchoMode.Password)
        form_layout.addRow("API Key:", self.openai_api_key)

        # ASR Section
        self.add_section_header(form_layout, "Speech Recognition Settings")
        self.asr_source = CustomCombo()
        self.asr_source.addItems(["faster_whisper", "whisper-1"])
        self.local_model_size = CustomCombo()
        self.local_model_size.addItems(["tiny", "tiny.en", "base", "base.en", "small", "small.en", 
                                      "medium", "medium.en", "large-v1", "large-v2", "large-v3"])
        self.device = CustomCombo()
        self.device.addItems(["auto", "cpu", "cuda"])
        form_layout.addRow("ASR Source:", self.asr_source)
        form_layout.addRow("Local Model Size:", self.local_model_size)
        form_layout.addRow("Device:", self.device)

        # LLM Section
        self.add_section_header(form_layout, "Language Model Settings")
        self.llm_source = CustomCombo()
        self.llm_source.addItems(["ollama", "openai_api"])
        self.llm_model = QLineEdit()
        self.max_tokens = QSpinBox()
        self.max_tokens.setRange(1, 10000)
        self.max_tokens.setValue(2000)
        self.temperature = QDoubleSpinBox()
        self.temperature.setRange(0.0, 1.0)
        self.temperature.setSingleStep(0.1)
        self.temperature.setValue(0.7)
        form_layout.addRow("LLM Source:", self.llm_source)
        form_layout.addRow("Model:", self.llm_model)
        form_layout.addRow("Max Tokens:", self.max_tokens)
        form_layout.addRow("Temperature:", self.temperature)

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

        # Hotkeys Section
        self.add_section_header(form_layout, "Hotkey Settings")
        self.start_recording_hotkey = QLineEdit()
        form_layout.addRow("Start Recording:", self.start_recording_hotkey)

        # Set the scroll area widget
        scroll_area.setWidget(scroll_content)
        settings_layout.addWidget(scroll_area)

        # Button container for Save and Reset
        button_container = QWidget()
        button_layout = QHBoxLayout(button_container)
        button_layout.setContentsMargins(0, 20, 0, 0)

        # Save button
        save_button = QPushButton("Save Settings")
        save_button.setObjectName("save_button")  # Add object name for styling
        save_button.clicked.connect(self.save_settings)
        button_layout.addWidget(save_button)

        # Reset button
        reset_button = QPushButton("Reset All")
        reset_button.setObjectName("reset_button")  # Add object name for styling
        reset_button.setFixedWidth(120)
        reset_button.clicked.connect(self.reset_all_settings)
        button_layout.addWidget(reset_button)
        button_layout.addStretch()

        settings_layout.addWidget(button_container)

        # Add settings page to stacked widget
        self.stacked_widget.addWidget(settings_page)

        # Add panels to main layout
        main_layout.addWidget(menu_panel)
        main_layout.addWidget(content_widget)

        # Load settings after UI is initialized
        self.load_settings()

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
        """Helper method to add styled section headers to the form"""
        header = QLabel(text)
        header.setStyleSheet("""
            font-size: 15px;
            font-weight: 600;
            color: #1C1C1E;
            margin-top: 24px;
            margin-bottom: 8px;
        """)
        layout.addRow(header)

    def save_settings(self):
        """Save all settings to QSettings"""
        settings = QSettings(OnboardingWindow.ORGANIZATION_NAME, OnboardingWindow.APPLICATION_NAME)
        
        # Save OpenAI settings
        settings.setValue("OpenAI/api_key", self.openai_api_key.text())
        
        # Save ASR settings
        settings.setValue("ASR/source", self.asr_source.currentText())
        settings.setValue("ASR/local_model_size", self.local_model_size.currentText())
        settings.setValue("ASR/device", self.device.currentText())
        
        # Save LLM settings
        settings.setValue("LLM/source", self.llm_source.currentText())
        settings.setValue("LLM/model", self.llm_model.text())
        settings.setValue("LLM/max_tokens", self.max_tokens.value())
        settings.setValue("LLM/temperature", self.temperature.value())
        
        # Save Audio settings
        settings.setValue("Audio/sample_rate", self.sample_rate.value())
        settings.setValue("Audio/channels", self.channels.value())
        
        # Save VAD settings
        settings.setValue("VAD/enabled", self.vad_enabled.isChecked())
        settings.setValue("VAD/aggressiveness", self.vad_aggressiveness.value())
        settings.setValue("VAD/silence_duration_ms", self.silence_duration.value())
        settings.setValue("VAD/frame_duration_ms", self.frame_duration.currentText())
        
        # Save Output settings
        settings.setValue("Output/method", self.output_method.currentText())
        
        # Save Hotkey settings
        settings.setValue("Hotkeys/start_recording_hotkey", self.start_recording_hotkey.text())
        
        settings.sync()

    def load_settings(self):
        """Load settings from QSettings"""
        print("Loading settings...")  # Debug log
        settings = QSettings(OnboardingWindow.ORGANIZATION_NAME, OnboardingWindow.APPLICATION_NAME)
        
        # Load OpenAI settings
        api_key = settings.value("OpenAI/api_key", "")
        print(f"Loading OpenAI API key: {api_key[:5]}...")  # Debug log
        self.openai_api_key.setText(api_key)
        
        # Load ASR settings
        asr_source = settings.value("ASR/source", "faster_whisper")
        print(f"Loading ASR source: {asr_source}")  # Debug log
        self.asr_source.setCurrentText(asr_source)
        
        local_model_size = settings.value("ASR/local_model_size", "large-v3")
        print(f"Loading local model size: {local_model_size}")  # Debug log
        self.local_model_size.setCurrentText(local_model_size)
        
        device = settings.value("ASR/device", "auto")
        print(f"Loading device: {device}")  # Debug log
        self.device.setCurrentText(device)
        
        # Load LLM settings
        llm_source = settings.value("LLM/source", "openai_api")
        print(f"Loading LLM source: {llm_source}")  # Debug log
        self.llm_source.setCurrentText(llm_source)
        
        llm_model = settings.value("LLM/model", "gpt-4.1")
        print(f"Loading LLM model: {llm_model}")  # Debug log
        self.llm_model.setText(llm_model)
        
        max_tokens = int(settings.value("LLM/max_tokens", 2000))
        print(f"Loading max tokens: {max_tokens}")  # Debug log
        self.max_tokens.setValue(max_tokens)
        
        temperature = float(settings.value("LLM/temperature", 0.7))
        print(f"Loading temperature: {temperature}")  # Debug log
        self.temperature.setValue(temperature)
        
        # Load Audio settings
        sample_rate = int(settings.value("Audio/sample_rate", 16000))
        print(f"Loading sample rate: {sample_rate}")  # Debug log
        self.sample_rate.setValue(sample_rate)
        
        channels = int(settings.value("Audio/channels", 1))
        print(f"Loading channels: {channels}")  # Debug log
        self.channels.setValue(channels)
        
        # Load VAD settings
        vad_enabled = settings.value("VAD/enabled", True, type=bool)
        print(f"Loading VAD enabled: {vad_enabled}")  # Debug log
        self.vad_enabled.setChecked(vad_enabled)
        
        aggressiveness = int(settings.value("VAD/aggressiveness", 1))
        print(f"Loading VAD aggressiveness: {aggressiveness}")  # Debug log
        self.vad_aggressiveness.setValue(aggressiveness)
        
        silence_duration = int(settings.value("VAD/silence_duration_ms", 1000))
        print(f"Loading silence duration: {silence_duration}")  # Debug log
        self.silence_duration.setValue(silence_duration)
        
        frame_duration = settings.value("VAD/frame_duration_ms", "30")
        print(f"Loading frame duration: {frame_duration}")  # Debug log
        self.frame_duration.setCurrentText(frame_duration)
        
        # Load Output settings
        output_method = settings.value("Output/method", "typewrite")
        print(f"Loading output method: {output_method}")  # Debug log
        self.output_method.setCurrentText(output_method)
        
        # Load Hotkey settings
        start_recording_hotkey = settings.value("Hotkeys/start_recording_hotkey", "f9")
        print(f"Loading start recording hotkey: {start_recording_hotkey}")  # Debug log
        self.start_recording_hotkey.setText(start_recording_hotkey)

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
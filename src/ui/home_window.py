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
    QSizePolicy,
)

from src.application_manager import ApplicationManager
from src.ui.onboarding import OnboardingWindow
from src.ui.components.inten_layout import IntenLayout
from src.ui.components.segmented_button_group import SegmentedButtonGroup
from src.utils.timing import save_timing_report, clear_timing_data

# --- Platform specific code for macOS ---
_ns_window = None
if sys.platform == "darwin":
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

        _objc_available = True
    except ImportError:
        print(
            "PyObjC framework (pyobjc-framework-Cocoa) not found. Cannot apply native macOS styling."
        )
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
                popup.layout().setContentsMargins(0, 0, 0, 0)
            popup.setContentsMargins(0, 0, 0, 0)

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
            OnboardingWindow.ORGANIZATION_NAME, OnboardingWindow.APPLICATION_NAME
        )

        # Connect signals
        self.app_manager.error_occurred.connect(self.handle_error)
        self.app_manager.status_changed.connect(self.handle_status_change)
        self.app_manager.settings_changed.connect(self.load_settings)

        # Show status window
        if hasattr(self.app_manager, "status_window"):
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
                    _ns_window.setStyleMask_(
                        _ns_window.styleMask() | NSFullSizeContentViewWindowMask
                    )
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
        menu_panel.setFixedWidth(180)
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
        center_layout.setSpacing(16)

        # Logo
        logo_label = QLabel()
        # Try to load logo from multiple possible locations
        logo_paths = [
            "inten-logo.png",  # Development path
            os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                "inten-logo.png",
            ),  # Production path
        ]
        logo_pixmap = None
        for path in logo_paths:
            if os.path.exists(path):
                logo_pixmap = QPixmap(path)
                if not logo_pixmap.isNull():
                    break

        if logo_pixmap and not logo_pixmap.isNull():
            scaled_pixmap = logo_pixmap.scaled(
                32,
                32,
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation,
            )
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
        self.settings_button.setObjectName(
            "settings_button"
        )
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
        content_layout.setContentsMargins(36, 20, 8, 8)
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
        form_layout.setContentsMargins(0, 0, 24, 0)  # Add right margin for scroll bar
        form_layout.setLabelAlignment(
            Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter
        )
        form_layout.setFormAlignment(
            Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter
        )

        # --- ASR Section ---
        self.add_section_header(form_layout, "Speech Recognition Settings")
        self.asr_source = SegmentedButtonGroup(["openai_api", "faster_whisper", "groq_api", "gemini_api"])
        asr_source_label = QLabel("ASR Provider")
        asr_source_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        asr_source_container = QWidget()
        asr_source_layout = QVBoxLayout(asr_source_container)
        asr_source_layout.setContentsMargins(0, 0, 0, 0)
        asr_source_layout.setSpacing(4)
        asr_source_layout.addWidget(asr_source_label)
        asr_source_layout.addWidget(self.asr_source)
        form_layout.addRow(asr_source_container)

        self.asr_model_label = QLabel("ASR Model")
        # Create all ASR model containers and their layouts FIRST
        self.openai_asr_model = SegmentedButtonGroup(["whisper-1"])
        openai_asr_model_label = QLabel("OpenAI Model")
        openai_asr_model_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        self.openai_asr_model_container = QWidget()
        openai_asr_model_layout = QVBoxLayout(self.openai_asr_model_container)
        openai_asr_model_layout.setContentsMargins(0, 0, 0, 0)
        openai_asr_model_layout.setSpacing(4)
        openai_asr_model_layout.addWidget(openai_asr_model_label)
        openai_asr_model_layout.addWidget(self.openai_asr_model)

        self.gemini_asr_model = SegmentedButtonGroup(["gemini-2.0-flash"])
        gemini_asr_model_label = QLabel("Gemini Model")
        gemini_asr_model_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        self.gemini_asr_model_container = QWidget()
        gemini_asr_model_layout = QVBoxLayout(self.gemini_asr_model_container)
        gemini_asr_model_layout.setContentsMargins(0, 0, 0, 0)
        gemini_asr_model_layout.setSpacing(4)
        gemini_asr_model_layout.addWidget(gemini_asr_model_label)
        gemini_asr_model_layout.addWidget(self.gemini_asr_model)

        self.faster_whisper_model = SegmentedButtonGroup([
            "tiny",
            "tiny.en",
            "base",
            "base.en",
            "small",
            "small.en",
            "medium",
            "medium.en",
            "large-v1",
            "large-v2",
            "large-v3",
        ])
        faster_whisper_model_label = QLabel("Local Whisper Model")
        faster_whisper_model_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        self.faster_whisper_model_container = QWidget()
        faster_whisper_model_layout = QVBoxLayout(self.faster_whisper_model_container)
        faster_whisper_model_layout.setContentsMargins(0, 0, 0, 0)
        faster_whisper_model_layout.setSpacing(4)
        faster_whisper_model_layout.addWidget(faster_whisper_model_label)
        faster_whisper_model_layout.addWidget(self.faster_whisper_model)

        self.groq_asr_model = SegmentedButtonGroup([
            "distil-whisper-large-v3-en",
            "whisper-large-v3-turbo",
            "whisper-large-v3"
        ])
        groq_asr_model_label = QLabel("Groq Model")
        groq_asr_model_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        self.groq_asr_model_container = QWidget()
        groq_asr_model_layout = QVBoxLayout(self.groq_asr_model_container)
        groq_asr_model_layout.setContentsMargins(0, 0, 0, 0)
        groq_asr_model_layout.setSpacing(4)
        groq_asr_model_layout.addWidget(groq_asr_model_label)
        groq_asr_model_layout.addWidget(self.groq_asr_model)

        # Now add them to the form layout
        form_layout.addRow(self.openai_asr_model_container)
        form_layout.addRow(self.gemini_asr_model_container)
        form_layout.addRow(self.faster_whisper_model_container)
        form_layout.addRow(self.groq_asr_model_container)
        # Hide all but the default
        self.openai_asr_model_container.show()
        self.faster_whisper_model_container.hide()
        self.groq_asr_model_container.hide()
        self.gemini_asr_model_container.hide()

        self.asr_device = SegmentedButtonGroup(["auto", "cpu", "cuda"])
        self.asr_device_label = QLabel("Device")
        self.asr_device_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        asr_device_container = QWidget()
        asr_device_layout = QVBoxLayout(asr_device_container)
        asr_device_layout.setContentsMargins(0, 0, 0, 0)
        asr_device_layout.setSpacing(4)
        asr_device_layout.addWidget(self.asr_device_label)
        asr_device_layout.addWidget(self.asr_device)
        form_layout.addRow(asr_device_container)

        self.asr_compute_type = SegmentedButtonGroup(["default", "int8", "int8_float16", "float16"])
        self.asr_compute_type_label = QLabel("Compute Type")
        self.asr_compute_type_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        asr_compute_type_container = QWidget()
        asr_compute_type_layout = QVBoxLayout(asr_compute_type_container)
        asr_compute_type_layout.setContentsMargins(0, 0, 0, 0)
        asr_compute_type_layout.setSpacing(4)
        asr_compute_type_layout.addWidget(self.asr_compute_type_label)
        asr_compute_type_layout.addWidget(self.asr_compute_type)
        form_layout.addRow(asr_compute_type_container)

        # Connect LLM source change to update model field and API key fields
        self.asr_source.selectionChanged.connect(self._update_api_key_fields)
        self.asr_source.selectionChanged.connect(self._update_asr_provider_fields)

        # LLM Section
        self.add_section_header(form_layout, "Language Model Settings")
        self.llm_source = SegmentedButtonGroup(["ollama", "openai_api", "groq_api", "gemini_api"])
        llm_source_label = QLabel("LLM Source")
        llm_source_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        llm_source_container = QWidget()
        llm_source_layout = QVBoxLayout(llm_source_container)
        llm_source_layout.setContentsMargins(0, 0, 0, 0)
        llm_source_layout.setSpacing(4)
        llm_source_layout.addWidget(llm_source_label)
        llm_source_layout.addWidget(self.llm_source)
        form_layout.addRow(llm_source_container)

        # Create all LLM model containers and their layouts FIRST
        self.llm_model_edit = QLineEdit()
        self.llm_model_edit.setMaximumWidth(300)
        self.llm_model_edit.setStyleSheet("""
            QLineEdit {
                background-color: rgba(255, 255, 255, 0.07);
                padding: 8px 12px;
                border-radius: 8px;
            }
        """)
        llm_model_edit_label = QLabel("Ollama Model")
        llm_model_edit_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        self.llm_model_edit_container = QWidget()
        llm_model_edit_layout = QVBoxLayout(self.llm_model_edit_container)
        llm_model_edit_layout.setContentsMargins(0, 0, 0, 0)
        llm_model_edit_layout.setSpacing(4)
        llm_model_edit_layout.addWidget(llm_model_edit_label)
        llm_model_edit_layout.addWidget(self.llm_model_edit)

        self.openai_model = SegmentedButtonGroup([
            "gpt-4.1",
            "gpt-4-turbo",
            "gpt-4",
            "gpt-3.5-turbo"
        ])
        openai_model_label = QLabel("OpenAI Model")
        openai_model_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        self.openai_model_container = QWidget()
        openai_model_layout = QVBoxLayout(self.openai_model_container)
        openai_model_layout.setContentsMargins(0, 0, 0, 0)
        openai_model_layout.setSpacing(4)
        openai_model_layout.addWidget(openai_model_label)
        openai_model_layout.addWidget(self.openai_model)

        self.gemini_model = SegmentedButtonGroup([
            "gemini-2.0-flash"
        ])
        gemini_model_label = QLabel("Gemini Model")
        gemini_model_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        self.gemini_model_container = QWidget()
        gemini_model_layout = QVBoxLayout(self.gemini_model_container)
        gemini_model_layout.setContentsMargins(0, 0, 0, 0)
        gemini_model_layout.setSpacing(4)
        gemini_model_layout.addWidget(gemini_model_label)
        gemini_model_layout.addWidget(self.gemini_model)

        self.groq_model = SegmentedButtonGroup([
            "llama-3.3-70b-versatile",
            "llama3-70b-8192",
            "mixtral-8x7b-32768",
            "gemma-7b-it"
        ])
        groq_model_label = QLabel("Groq Model")
        groq_model_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        self.groq_model_container = QWidget()
        groq_model_layout = QVBoxLayout(self.groq_model_container)
        groq_model_layout.setContentsMargins(0, 0, 0, 0)
        groq_model_layout.setSpacing(4)
        groq_model_layout.addWidget(groq_model_label)
        groq_model_layout.addWidget(self.groq_model)

        # Now add them to the form layout
        form_layout.addRow(self.llm_model_edit_container)
        form_layout.addRow(self.openai_model_container)
        form_layout.addRow(self.groq_model_container)
        form_layout.addRow(self.gemini_model_container)
        # Hide all but the default
        self.llm_model_edit_container.show()
        self.openai_model_container.hide()
        self.groq_model_container.hide()
        self.gemini_model_container.hide()

        self.max_tokens = QSpinBox()
        self.max_tokens.setRange(1, 25000)
        self.max_tokens.setValue(2000)
        form_layout.addRow("Max Tokens:", self.max_tokens)

        self.temperature = QDoubleSpinBox()
        self.temperature.setRange(0.0, 1.0)
        self.temperature.setSingleStep(0.1)
        self.temperature.setValue(0.7)
        form_layout.addRow("Temperature:", self.temperature)

        # Connect LLM source change to update model field and API key fields
        self.llm_source.selectionChanged.connect(self._update_llm_provider_fields)
        self.llm_source.selectionChanged.connect(self._update_api_key_fields)

        # API Keys Section
        self.add_section_header(form_layout, "API Key Settings")
        self.openai_api_key_edit = QLineEdit()
        self.openai_api_key_edit.setEchoMode(QLineEdit.EchoMode.Password)
        self.openai_api_key_edit.setMaximumWidth(300)
        self.openai_api_key_edit.setStyleSheet("""
            QLineEdit {
                background-color: rgba(255, 255, 255, 0.07);
                padding: 8px 12px;
                border-radius: 8px;
            }
        """)
        openai_api_key_label = QLabel("OpenAI API Key")
        openai_api_key_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        openai_api_key_container = QWidget()
        openai_api_key_layout = QVBoxLayout(openai_api_key_container)
        openai_api_key_layout.setContentsMargins(0, 0, 0, 0)
        openai_api_key_layout.setSpacing(4)
        openai_api_key_layout.addWidget(openai_api_key_label)
        openai_api_key_layout.addWidget(self.openai_api_key_edit)
        form_layout.addRow(openai_api_key_container)

        self.gemini_api_key_edit = QLineEdit()
        self.gemini_api_key_edit.setEchoMode(QLineEdit.EchoMode.Password)
        self.gemini_api_key_edit.setMaximumWidth(300)
        self.gemini_api_key_edit.setStyleSheet("""
            QLineEdit {
                background-color: rgba(255, 255, 255, 0.07);
                padding: 8px 12px;
                border-radius: 8px;
            }
        """)
        gemini_api_key_label = QLabel("Gemini API Key")
        gemini_api_key_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        gemini_api_key_container = QWidget()
        gemini_api_key_layout = QVBoxLayout(gemini_api_key_container)
        gemini_api_key_layout.setContentsMargins(0, 0, 0, 0)
        gemini_api_key_layout.setSpacing(4)
        gemini_api_key_layout.addWidget(gemini_api_key_label)
        gemini_api_key_layout.addWidget(self.gemini_api_key_edit)
        form_layout.addRow(gemini_api_key_container)

        self.groq_api_key_edit = QLineEdit()
        self.groq_api_key_edit.setEchoMode(QLineEdit.EchoMode.Password)
        self.groq_api_key_edit.setMaximumWidth(300)
        self.groq_api_key_edit.setStyleSheet("""
            QLineEdit {
                background-color: rgba(255, 255, 255, 0.07);
                padding: 8px 12px;
                border-radius: 8px;
            }
        """)
        groq_api_key_label = QLabel("Groq API Key")
        groq_api_key_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        groq_api_key_container = QWidget()
        groq_api_key_layout = QVBoxLayout(groq_api_key_container)
        groq_api_key_layout.setContentsMargins(0, 0, 0, 0)
        groq_api_key_layout.setSpacing(4)
        groq_api_key_layout.addWidget(groq_api_key_label)
        groq_api_key_layout.addWidget(self.groq_api_key_edit)
        form_layout.addRow(groq_api_key_container)

        # Mode Section
        self.add_section_header(form_layout, "Application Mode")
        self.streaming_mode = QCheckBox()
        self.streaming_mode.stateChanged.connect(self.update_setting_visibility)
        form_layout.addRow("Streaming Mode (Requires Vosk):", self.streaming_mode)

        # Vosk Section
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
        vosk_model_path_label = QLabel("Model Path")
        vosk_model_path_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        vosk_model_path_container = QWidget()
        vosk_model_path_layout = QVBoxLayout(vosk_model_path_container)
        vosk_model_path_layout.setContentsMargins(0, 0, 0, 0)
        vosk_model_path_layout.setSpacing(4)
        vosk_model_path_layout.addWidget(vosk_model_path_label)
        vosk_model_path_layout.addWidget(self.vosk_model_path_edit)
        form_layout.addRow(vosk_model_path_container)

        # Audio Section
        self.add_section_header(form_layout, "Audio Settings")
        self.sample_rate = SegmentedButtonGroup(["8000", "16000", "22050", "44100", "48000"])
        sample_rate_label = QLabel("Sample Rate")
        sample_rate_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        sample_rate_container = QWidget()
        sample_rate_layout = QVBoxLayout(sample_rate_container)
        sample_rate_layout.setContentsMargins(0, 0, 0, 0)
        sample_rate_layout.setSpacing(4)
        sample_rate_layout.addWidget(sample_rate_label)
        sample_rate_layout.addWidget(self.sample_rate)
        form_layout.addRow(sample_rate_container)

        self.channels = SegmentedButtonGroup(["1", "2"])
        channels_label = QLabel("Channels")
        channels_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        channels_container = QWidget()
        channels_layout = QVBoxLayout(channels_container)
        channels_layout.setContentsMargins(0, 0, 0, 0)
        channels_layout.setSpacing(4)
        channels_layout.addWidget(channels_label)
        channels_layout.addWidget(self.channels)
        form_layout.addRow(channels_container)

        # VAD Section
        self.add_section_header(form_layout, "Voice Activity Detection")
        self.vad_enabled = QCheckBox()
        self.vad_aggressiveness = SegmentedButtonGroup(["0", "1", "2", "3"])
        vad_aggressiveness_label = QLabel("Aggressiveness")
        vad_aggressiveness_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        vad_aggressiveness_container = QWidget()
        vad_aggressiveness_layout = QVBoxLayout(vad_aggressiveness_container)
        vad_aggressiveness_layout.setContentsMargins(0, 0, 0, 0)
        vad_aggressiveness_layout.setSpacing(4)
        vad_aggressiveness_layout.addWidget(vad_aggressiveness_label)
        vad_aggressiveness_layout.addWidget(self.vad_aggressiveness)
        form_layout.addRow(vad_aggressiveness_container)

        self.silence_duration = SegmentedButtonGroup(["100", "500", "1000", "2000", "5000"])
        silence_duration_label = QLabel("Silence Duration (ms)")
        silence_duration_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        silence_duration_container = QWidget()
        silence_duration_layout = QVBoxLayout(silence_duration_container)
        silence_duration_layout.setContentsMargins(0, 0, 0, 0)
        silence_duration_layout.setSpacing(4)
        silence_duration_layout.addWidget(silence_duration_label)
        silence_duration_layout.addWidget(self.silence_duration)
        form_layout.addRow(silence_duration_container)

        self.frame_duration = SegmentedButtonGroup(["10", "20", "30"])
        frame_duration_label = QLabel("Frame Duration (ms)")
        frame_duration_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        frame_duration_container = QWidget()
        frame_duration_layout = QVBoxLayout(frame_duration_container)
        frame_duration_layout.setContentsMargins(0, 0, 0, 0)
        frame_duration_layout.setSpacing(4)
        frame_duration_layout.addWidget(frame_duration_label)
        frame_duration_layout.addWidget(self.frame_duration)
        form_layout.addRow(frame_duration_container)

        # Output Section
        self.add_section_header(form_layout, "Output Settings")
        self.output_method = SegmentedButtonGroup(["typewrite", "clipboard"])
        output_method_label = QLabel("Output Method")
        output_method_label.setStyleSheet("font-size: 13px; color: #FFFFFF; padding: 8px 0px;")
        output_method_container = QWidget()
        output_method_layout = QVBoxLayout(output_method_container)
        output_method_layout.setContentsMargins(0, 0, 0, 0)
        output_method_layout.setSpacing(4)
        output_method_layout.addWidget(output_method_label)
        output_method_layout.addWidget(self.output_method)
        form_layout.addRow(output_method_container)

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
        start_recording_hotkey_label = QLabel("Start Recording")
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

        # --- Developer Timing Tools Section (Conditional) ---
        DEV_MODE = os.getenv("DEV", "false").lower() == "true"

        if DEV_MODE:
            self.add_section_header(form_layout, "Developer Timing Tools")

            # Timing report buttons container (re-using form_layout for consistency)
            # We'll add a QWidget to the form_layout that then contains the buttons in an QHBoxLayout

            timing_buttons_widget = QWidget()
            timing_button_layout = QHBoxLayout(timing_buttons_widget)
            timing_button_layout.setContentsMargins(
                0, 0, 0, 0
            )  # No margins for the inner layout
            timing_button_layout.setSpacing(10)

            self.save_timing_report_button = QPushButton("Save Timing Report")
            self.save_timing_report_button.setObjectName("save_timing_report_button")
            self.save_timing_report_button.setFixedWidth(160)
            self.save_timing_report_button.clicked.connect(
                self.handle_save_timing_report
            )
            timing_button_layout.addWidget(self.save_timing_report_button)

            self.clear_timing_data_button = QPushButton("Clear Timing Data")
            self.clear_timing_data_button.setObjectName("clear_timing_data_button")
            self.clear_timing_data_button.setFixedWidth(160)
            self.clear_timing_data_button.clicked.connect(self.handle_clear_timing_data)
            timing_button_layout.addWidget(self.clear_timing_data_button)

            timing_button_layout.addStretch()  # Push buttons to the left

            # Add the widget containing the buttons to the form layout
            # We add it without a label, spanning both columns for the buttons
            form_layout.addRow(timing_buttons_widget)

        # Add settings page to stacked widget
        self.stacked_widget.addWidget(self.settings_page)

        # --- Menu panel and divider container ---
        menu_container = QWidget()
        menu_container_layout = QVBoxLayout(menu_container)
        menu_container_layout.setContentsMargins(0, 0, 0, 0)
        menu_container_layout.setSpacing(0)
        menu_container_layout.addWidget(menu_panel)
        main_layout.addWidget(menu_container)
        main_layout.addWidget(content_widget)

        # Load settings after UI is fully initialized
        QTimer.singleShot(100, self.load_settings)  # Increased delay to ensure UI is ready
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

    def handle_save_timing_report(self):
        """Handles the click of the 'Save Timing Report' button."""
        try:
            # You can customize the filepath here if needed, e.g., using a QFileDialog
            # For now, it uses the default "timing_report.json" in the working directory.
            save_timing_report()
            QMessageBox.information(
                self, "Timing Report", "Timing report saved successfully."
            )
        except Exception as e:
            QMessageBox.critical(
                self, "Timing Report Error", f"Failed to save timing report: {str(e)}"
            )
            print(f"Error saving timing report: {traceback.format_exc()}")

    def handle_clear_timing_data(self):
        """Handles the click of the 'Clear Timing Data' button."""
        try:
            clear_timing_data()
            QMessageBox.information(
                self, "Timing Data", "Timing data cleared successfully."
            )
        except Exception as e:
            QMessageBox.critical(
                self, "Timing Data Error", f"Failed to clear timing data: {str(e)}"
            )
            print(f"Error clearing timing data: {traceback.format_exc()}")

    def reset_all_settings(self):
        """Reset all settings and restart the onboarding process."""
        # Clear all settings
        settings = QSettings(
            OnboardingWindow.ORGANIZATION_NAME, OnboardingWindow.APPLICATION_NAME
        )
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
            divider.setStyleSheet(
                "background: rgba(242, 228, 214, 0.3); border: none; margin-top: 16px; margin-bottom: 16px;"
            )
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
                self, "Application Error", f"Failed to start application:\n{error_msg}"
            )

    def handle_status_change(self, status: str) -> None:
        """Handle status updates from ApplicationManager"""
        pass  # Status is now handled by StatusWindow

    def save_settings(self):
        """Save all settings to QSettings"""
        try:
            llm_source_value = self.llm_source.currentText()
            print(f"LLM Source: {llm_source_value}")

            current_llm_model_value = ""
            if llm_source_value == "ollama":
                current_llm_model_value = self.llm_model_edit.text()
            elif llm_source_value == "openai_api":
                current_llm_model_value = self.openai_model.currentText()
            elif llm_source_value == "groq_api":
                current_llm_model_value = self.groq_model.currentText()
            elif llm_source_value == "gemini_api":
                current_llm_model_value = self.gemini_model.currentText()

            vosk_model_path_value = self.vosk_model_path_edit.text()
            is_streaming = self.streaming_mode.isChecked()

            if is_streaming and not vosk_model_path_value:
                self.handle_error(
                    "Vosk Model Path cannot be empty when Streaming Mode is enabled."
                )
                return

            asr_source_value = self.asr_source.currentText()
            current_asr_provider_model_value = ""
            current_asr_local_model_size = (
                self.faster_whisper_model.currentText()
            )

            openai_client_asr_model = (
                self.openai_asr_model.currentText()
            )  # Default for OpenAI client
            groq_client_asr_model = (
                self.groq_asr_model.currentText()
            )  # Default for Groq client
            gemini_client_asr_model = (
                self.gemini_asr_model.currentText()
            )  # Default for Gemini client

            if asr_source_value == "openai_api":
                current_asr_provider_model_value = (
                    self.openai_asr_model.currentText()
                )
                openai_client_asr_model = (
                    current_asr_provider_model_value  # Sync if OpenAI is ASR provider
                )
            elif asr_source_value == "gemini_api":
                current_asr_provider_model_value = (
                    self.gemini_asr_model.currentText()
                )
                gemini_client_asr_model = (
                    current_asr_provider_model_value  # Sync if Gemini is ASR provider
                )
            elif asr_source_value == "groq_api":
                current_asr_provider_model_value = (
                    self.groq_asr_model.currentText()
                )
                groq_client_asr_model = (
                    current_asr_provider_model_value  # Sync if Groq is ASR provider
                )
            elif asr_source_value == "faster_whisper":
                # No change to current_asr_provider_model_value, it remains "" or undefined for ASR/model
                pass

            new_settings = {
                "APIKeys": {
                    "openai_api_key": self.openai_api_key_edit.text(),
                    "groq_api_key": self.groq_api_key_edit.text(),
                    "gemini_api_key": self.gemini_api_key_edit.text(),
                },
                "OpenAI": {
                    "user_command_model": self.openai_model.currentText(),
                    "asr_model": openai_client_asr_model,
                },
                "Gemini": {
                    "user_command_model": self.gemini_model.currentText(),
                    "asr_model": gemini_client_asr_model,
                },
                "Ollama": {"model": self.llm_model_edit.text()},
                "Groq": {
                    "user_command_model": self.groq_model.currentText(),
                    "asr_model": groq_client_asr_model,
                },
                "ASR": {
                    "source": asr_source_value,
                    "model": current_asr_provider_model_value,
                    "local_model_size": current_asr_local_model_size,
                    "device": self.asr_device.currentText(),
                    "compute_type": self.asr_compute_type.currentText(),
                },
                "Vosk": {"model_path": vosk_model_path_value},
                "LLM": {
                    "source": llm_source_value,
                    "model": current_llm_model_value,
                    "max_tokens": self.max_tokens.value(),
                    "temperature": self.temperature.value(),
                },
                "Audio": {
                    "sample_rate": self.sample_rate.value(),
                    "channels": self.channels.value(),
                },
                "VAD": {
                    "enabled": self.vad_enabled.isChecked(),
                    "aggressiveness": self.vad_aggressiveness.value(),
                    "silence_duration_ms": self.silence_duration.value(),
                    "frame_duration_ms": int(self.frame_duration.currentText()),
                },
                "Output": {
                    "method": self.output_method.currentText(),
                },
                "Hotkeys": {
                    "start_recording_hotkey": self.start_recording_hotkey.text(),
                },
                "Mode": {"streaming": str(is_streaming).lower()},
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
                if (
                    not self.app_manager.app_thread
                    or not self.app_manager.app_thread.is_alive()
                ):
                    if not self.app_manager.start_application():
                        self.handle_error(
                            "Failed to start application after saving settings"
                        )
                        return
        except Exception as e:
            self.handle_error(f"Failed to save settings: {str(e)}")

    def load_settings(self):
        """Load settings from QSettings"""
        try:
            config = self.app_manager.load_settings()

            api_keys_config = config.get("APIKeys", {})
            self.openai_api_key_edit.setText(api_keys_config.get("openai_api_key", ""))
            self.gemini_api_key_edit.setText(api_keys_config.get("gemini_api_key", ""))
            self.groq_api_key_edit.setText(api_keys_config.get("groq_api_key", ""))

            asr_config = config.get("ASR", {})
            self.asr_source.blockSignals(True)
            self.asr_source.setCurrentText(asr_config.get("source", "openai_api"))
            self.asr_source.blockSignals(False)

            # Set ASR model values before calling _update_asr_provider_fields
            # Default to "whisper-1" for OpenAI ASR if not found
            self.openai_asr_model.setCurrentText(
                config.get("OpenAI", {}).get("asr_model", "whisper-1")
            )

            # Default for Gemini ASR from Gemini section or a general default
            self.gemini_asr_model.setCurrentText(
                config.get("Gemini", {}).get("asr_model", "gemini-2.0-flash")
            )

            # Default for Groq ASR from Groq section or a general default
            self.groq_asr_model.setCurrentText(
                config.get("Groq", {}).get("asr_model", "distil-whisper-large-v3-en")
            )
            # Default for faster_whisper from ASR section
            self.faster_whisper_model.setCurrentText(
                asr_config.get("local_model_size", "base.en")
            )

            self.asr_device.setCurrentText(asr_config.get("device", "auto"))
            self.asr_compute_type.setCurrentText(
                asr_config.get("compute_type", "default")
            )

            self._update_asr_provider_fields()  # Update visibility and set correct model for current source

            self.llm_source.blockSignals(True)
            self.llm_source.setCurrentText(config["LLM"]["source"])
            self.llm_source.blockSignals(False)

            # Model field is now handled by _update_llm_provider_fields
            # We need to ensure _update_llm_provider_fields correctly sets the user_command_model
            # based on the loaded LLM source and its specific model.

            # OpenAI model (user_command_model) is set by _update_llm_provider_fields if source is openai_api
            # Groq model (user_command_model) is set by _update_llm_provider_fields if source is groq_api
            # Ollama model is set by _update_llm_provider_fields if source is ollama

            self.max_tokens.setValue(config["LLM"]["max_tokens"])
            self.temperature.setValue(config["LLM"]["temperature"])

            # Call to update dynamic LLM fields
            self._update_llm_provider_fields()

            # Load Audio settings
            self.sample_rate.setCurrentText(str(config['Audio']['sample_rate']))
            self.channels.setCurrentText(str(config['Audio']['channels']))
            
            # Load VAD settings
            self.vad_enabled.setChecked(config['VAD']['enabled'])
            self.vad_aggressiveness.setCurrentText(str(config['VAD']['aggressiveness']))
            self.silence_duration.setCurrentText(str(config['VAD']['silence_duration_ms']))
            self.frame_duration.setCurrentText(str(config['VAD']['frame_duration_ms']))
            
            # Load Output settings
            self.output_method.setCurrentText(config["Output"]["method"])

            # Load Hotkey settings
            self.start_recording_hotkey.setText(
                config["Hotkeys"]["start_recording_hotkey"]
            )

            # Load Mode settings
            mode_config = config.get("Mode", {})
            self.streaming_mode.setChecked(
                mode_config.get("streaming", "false") == "true"
            )

            # Load Vosk settings (Path is now guaranteed by ApplicationManager)
            vosk_config = config.get("Vosk", {})
            vosk_path_from_config = vosk_config.get(
                "model_path"
            )  # Should always have a valid path now
            self.vosk_model_path_edit.setText(
                vosk_path_from_config if vosk_path_from_config else ""
            )  # Set text, handle potential None just in case

        except Exception as e:
            print(f"Error in load_settings: {str(e)}")
            print(f"Error details: {traceback.format_exc()}")
            self.handle_error(f"Failed to load settings: {str(e)}")

    def closeEvent(self, event):
        """Handle window close event"""
        self.app_manager.stop_application()
        # Hide status window
        if hasattr(self.app_manager, "status_window"):
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

    def _update_llm_provider_fields(self, current_llm_source_text=None):
        """Update model fields based on the selected LLM source."""
        # Block signals from model widgets during programmatic update
        self.llm_model_edit.blockSignals(True)
        self.openai_model.blockSignals(True)
        self.groq_model.blockSignals(True)
        self.gemini_model.blockSignals(True)

        try:
            config = self.app_manager.load_settings()  # Get fresh complete settings
            llm_source = self.llm_source.currentText()

            # Default values from ApplicationManager for consistency
            default_openai_model = config.get("OpenAI", {}).get("model", "gpt-4.1")
            default_gemini_model = config.get("Gemini", {}).get("model", "gemini-2.0-flash")
            default_groq_model = config.get("Groq", {}).get("model", "llama-3.3-70b-versatile")
            default_ollama_model = config.get("Ollama", {}).get("model", "llama3.2:latest")

            # Get the actual model stored for the current source under LLM/model if available,
            # otherwise use the provider-specific model, then the ultimate default.
            llm_config_model = config.get("LLM", {}).get("model")

            # Hide all containers first
            self.llm_model_edit_container.hide()
            self.openai_model_container.hide()
            self.groq_model_container.hide()
            self.gemini_model_container.hide()

            # Show appropriate container and set model based on source
            if llm_source == "openai_api":
                self.openai_model_container.show()
                # Use user_command_model from OpenAI section, then LLM/model, then default
                openai_specific_model = config.get("OpenAI", {}).get("user_command_model", default_openai_model)
                model_to_set = llm_config_model if llm_config_model and llm_config_model in self.openai_model.buttons else openai_specific_model
                self.openai_model.setCurrentText(model_to_set)
            elif llm_source == "gemini_api":
                self.gemini_model_container.show()
                # Use user_command_model from Gemini section, then LLM/model, then default
                gemini_specific_model = config.get("Gemini", {}).get("user_command_model", default_gemini_model)
                model_to_set = llm_config_model if llm_config_model and llm_config_model in self.gemini_model.buttons else gemini_specific_model
                self.gemini_model.setCurrentText(model_to_set)
            elif llm_source == "groq_api":
                self.groq_model_container.show()
                # Use user_command_model from Groq section, then LLM/model, then default
                groq_specific_model = config.get("Groq", {}).get("user_command_model", default_groq_model)
                model_to_set = llm_config_model if llm_config_model and llm_config_model in self.groq_model.buttons else groq_specific_model
                self.groq_model.setCurrentText(model_to_set)
            else:  # ollama or unknown source
                self.llm_model_edit_container.show()
                self.llm_model_edit.setText(llm_config_model if llm_config_model else default_ollama_model)

        finally:
            # Unblock signals
            self.llm_model_edit.blockSignals(False)
            self.openai_model.blockSignals(False)
            self.groq_model.blockSignals(False)
            self.gemini_model.blockSignals(False)

    def update_setting_visibility(self):
        """Show/hide settings based on other selections (e.g., streaming mode)."""
        is_streaming = self.streaming_mode.isChecked()

        # Find the Vosk model path row in the form layout and toggle visibility
        # Now self.settings_page should exist
        settings_form_layout = self.settings_page.findChild(QFormLayout)
        if not settings_form_layout:
            print(
                "Error: Could not find QFormLayout within settings page in update_setting_visibility"
            )
            return

        vosk_header_label = None
        vosk_path_label = None
        vosk_path_field = None

        for i in range(settings_form_layout.rowCount()):
            label_item = settings_form_layout.itemAt(i, QFormLayout.ItemRole.LabelRole)
            field_item = settings_form_layout.itemAt(i, QFormLayout.ItemRole.FieldRole)

            if (
                label_item
                and label_item.widget()
                and isinstance(label_item.widget(), QLabel)
            ):
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

    def _update_api_key_fields(self):
        """Show/hide API key fields based on ASR and LLM provider selections."""
        asr_source = self.asr_source.currentText()
        llm_source = self.llm_source.currentText()

        # Determine if OpenAI key is needed
        show_openai_key = (asr_source == "openai_api") or (llm_source == "openai_api")
        self.openai_api_key_edit.setVisible(show_openai_key)

        # Determine if Gemini key is needed
        show_gemini_key = (asr_source == "gemini_api") or (llm_source == "gemini_api")
        self.gemini_api_key_edit.setVisible(show_gemini_key)

        # Determine if Groq key is needed
        show_groq_key = (llm_source == "groq_api") or (asr_source == "groq_api")
        self.groq_api_key_edit.setVisible(show_groq_key)

    def _update_asr_provider_fields(self):
        """Update ASR model fields based on the selected ASR source."""
        # Block signals from model widgets during programmatic update
        self.openai_asr_model.blockSignals(True)
        self.faster_whisper_model.blockSignals(True)
        self.groq_asr_model.blockSignals(True)

        try:
            config = self.app_manager.load_settings()  # Get fresh complete settings
            asr_source = self.asr_source.currentText()
            asr_config = config.get("ASR", {})

            # Get the primary ASR model string for OpenAI/Groq from ASR/model setting
            current_asr_model_setting = asr_config.get("model", "")

            # Hide all containers first
            self.openai_asr_model_container.hide()
            self.faster_whisper_model_container.hide()
            self.groq_asr_model_container.hide()
            self.gemini_asr_model_container.hide()

            if asr_source == "openai_api":
                self.openai_asr_model_container.show()
                openai_default = config.get("OpenAI", {}).get("asr_model", "whisper-1")
                model_to_set = (
                    current_asr_model_setting
                    if current_asr_model_setting and current_asr_model_setting in self.openai_asr_model.buttons
                    else openai_default
                )
                self.openai_asr_model.setCurrentText(model_to_set)
                self.asr_model_label.setText("ASR Model (OpenAI):")
            elif asr_source == "gemini_api":
                self.gemini_asr_model_container.show()
                gemini_default = config.get("Gemini", {}).get("asr_model", "gemini-2.0-flash")
                model_to_set = (
                    current_asr_model_setting
                    if current_asr_model_setting and current_asr_model_setting in self.gemini_asr_model.buttons
                    else gemini_default
                )
                self.gemini_asr_model.setCurrentText(model_to_set)
                self.asr_model_label.setText("ASR Model (Gemini):")
            elif asr_source == "faster_whisper":
                self.faster_whisper_model_container.show()
                model_to_set = asr_config.get("local_model_size", "base.en")
                self.faster_whisper_model.setCurrentText(model_to_set)
                self.asr_model_label.setText("ASR Model (Local Whisper):")
            elif asr_source == "groq_api":
                self.groq_asr_model_container.show()
                groq_default = config.get("Groq", {}).get("asr_model", "distil-whisper-large-v3-en")
                model_to_set = (
                    current_asr_model_setting
                    if current_asr_model_setting and current_asr_model_setting in self.groq_asr_model.buttons
                    else groq_default
                )
                self.groq_asr_model.setCurrentText(model_to_set)
                self.asr_model_label.setText("ASR Model (Groq):")
            else:
                self.openai_asr_model_container.show()
                self.openai_asr_model.setCurrentText(
                    config.get("OpenAI", {}).get("asr_model", "whisper-1")
                )
                self.asr_model_label.setText("ASR Model:")

            # Show/hide ASR device and compute type which are typically for local models
            is_local_asr = asr_source == "faster_whisper"
            settings_form_layout = self.settings_page.findChild(QFormLayout)
            if settings_form_layout:
                for i in range(settings_form_layout.rowCount()):
                    label_item = settings_form_layout.itemAt(
                        i, QFormLayout.ItemRole.LabelRole
                    )
                    if (
                        label_item
                        and label_item.widget()
                        and isinstance(label_item.widget(), QLabel)
                    ):
                        label_widget = label_item.widget()
                        if (
                            label_widget is self.asr_device_label
                            or label_widget is self.asr_compute_type_label
                        ):
                            field_item = settings_form_layout.itemAt(
                                i, QFormLayout.ItemRole.FieldRole
                            )
                            label_widget.setVisible(is_local_asr)
                            if field_item and field_item.widget():
                                field_item.widget().setVisible(is_local_asr)

        finally:
            self.openai_asr_model.blockSignals(False)
            self.faster_whisper_model.blockSignals(False)
            self.groq_asr_model.blockSignals(False)

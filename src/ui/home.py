import logging
import traceback

from PySide6.QtCore import QPointF, QSettings, Qt, QTimer
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import (
    QDoubleSpinBox,
    QFormLayout,
    QFrame,
    QGraphicsOpacityEffect,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from src.application_manager import ApplicationManager
from src.ui.components.inten_layout import IntenLayout
from src.ui.components.menu_button import MenuButton
from src.ui.components.segmented_button_group import SegmentedButtonGroup
from src.ui.keyboard_manager import KeyboardManager
from src.ui.onboarding import OnboardingWindow
from src.ui.theme.manager import ThemeManager
from src.utils.timing import clear_timing_data, save_timing_report

# Configure logging
logger = logging.getLogger(__name__)


class Home(QMainWindow):
    # Centralized UI Restriction Rules
    # Each rule defines a condition and actions to take if the condition is met or not.
    UI_RESTRICTIONS = [
        {  # ONESHOT mode: force LLM to gemini, disable Speech Rec tab
            "condition": {
                "widget_name": "application_mode_selector",
                "property": "currentText",
                "value": "oneshot",
            },
            "then_actions": [
                {
                    "target_widget_name": "llm_source",
                    "action": "force_selection",
                    "value": "gemini_api",
                },
                {  # ADDED: Disable Speech Rec tab
                    "target_widget_name": "speech_recognition_button",
                    "action": "set_enabled",
                    "enabled": False,
                },
            ],
            "else_actions": [  # Only manage llm_source here
                {"target_widget_name": "llm_source", "action": "enable_all_options"}
            ],
        },
        {  # STREAMING mode: show Vosk path, disable Speech Rec tab
            "condition": {
                "widget_name": "application_mode_selector",
                "property": "currentText",
                "value": "streaming",
            },
            "then_actions": [
                {
                    "target_widget_name": "vosk_model_path_container",
                    "action": "set_visibility_and_space",
                    "visible": True,
                },
                {  # ADDED: Disable Speech Rec tab
                    "target_widget_name": "speech_recognition_button",
                    "action": "set_enabled",
                    "enabled": False,
                },
            ],
            "else_actions": [  # Only manage vosk_model_path_container here
                {
                    "target_widget_name": "vosk_model_path_container",
                    "action": "set_visibility_and_space",
                    "visible": False,
                }
            ],
        },
        # --- Rules for LLM Provider Model Container Visibility ---
        {
            "condition": {
                "widget_name": "llm_source",
                "property": "currentText",
                "value": "openai_api",
            },
            "then_actions": [
                {
                    "target_widget_name": "openai_model_container",
                    "action": "set_visibility_and_space",
                    "visible": True,
                }
            ],
            "else_actions": [
                {
                    "target_widget_name": "openai_model_container",
                    "action": "set_visibility_and_space",
                    "visible": False,
                }
            ],
        },
        {
            "condition": {
                "widget_name": "llm_source",
                "property": "currentText",
                "value": "gemini_api",
            },
            "then_actions": [
                {
                    "target_widget_name": "gemini_model_container",
                    "action": "set_visibility_and_space",
                    "visible": True,
                }
            ],
            "else_actions": [
                {
                    "target_widget_name": "gemini_model_container",
                    "action": "set_visibility_and_space",
                    "visible": False,
                }
            ],
        },
        {
            "condition": {
                "widget_name": "llm_source",
                "property": "currentText",
                "value": "groq_api",
            },
            "then_actions": [
                {
                    "target_widget_name": "groq_model_container",
                    "action": "set_visibility_and_space",
                    "visible": True,
                }
            ],
            "else_actions": [
                {
                    "target_widget_name": "groq_model_container",
                    "action": "set_visibility_and_space",
                    "visible": False,
                }
            ],
        },
        {
            "condition": {
                "widget_name": "llm_source",
                "property": "currentText",
                "value": "ollama",
            },
            "then_actions": [
                {
                    "target_widget_name": "llm_model_edit_container",
                    "action": "set_visibility_and_space",
                    "visible": True,
                }
            ],
            "else_actions": [
                {
                    "target_widget_name": "llm_model_edit_container",
                    "action": "set_visibility_and_space",
                    "visible": False,
                }
            ],
        },
        # Add more rules here as new interdependencies are identified.
        # Example: A rule based on llm_source selection affecting another widget.
        # {
        #     "condition": {
        #         "widget_name": "llm_source",
        #         "property": "currentText",
        #         "value": "ollama"
        #     },
        #     "then_actions": [...],
        #     "else_actions": [...]
        # }
    ]

    def __init__(self, theme_manager: ThemeManager):
        super().__init__()
        self.theme_manager = theme_manager
        self.theme_manager.theme_changed.connect(self.update_styles)
        self.keyboard_manager = KeyboardManager.instance()
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setWindowFlags(self.windowFlags() | Qt.WindowType.FramelessWindowHint)
        self.setWindowTitle("Inten")
        self.setMinimumWidth(900)
        self.setMinimumHeight(600)

        # Add debounce timer for settings
        self.save_settings_timer = QTimer()
        self.save_settings_timer.setSingleShot(True)
        self.save_settings_timer.timeout.connect(self._save_settings_impl)

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

        # Main widget and layout
        main_widget = IntenLayout(
            self, radius=8, show_close_button=True, theme_manager=self.theme_manager
        )
        main_widget.setObjectName("main_widget")
        self.setCentralWidget(main_widget)
        main_layout = QHBoxLayout()
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)
        main_widget.layout.addLayout(main_layout)
        self._effective_top_margin = main_widget.get_effective_top_margin()
        main_widget.layout.setContentsMargins(20, self._effective_top_margin, 20, 20)
        main_widget.layout.setSpacing(20)

        # Left menu panel
        menu_panel = QWidget()
        menu_panel.setObjectName("menu_panel")  # Add object name for styling
        menu_panel.setFixedWidth(200)
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
        self.logo_label = QLabel()
        # Use theme manager to get the correct logo path
        logo_path = self.theme_manager.get_logo_path()
        logo_pixmap = None
        if logo_path:
            logo_pixmap = QPixmap(logo_path)
            if not logo_pixmap.isNull():
                scaled_pixmap = logo_pixmap.scaled(
                    32,
                    32,
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation,
                )
                self.logo_label.setPixmap(scaled_pixmap)
                self.logo_label.setText("")
            else:
                self.logo_label.setText("🎯")
        else:
            self.logo_label.setText("🎯")
        center_layout.addWidget(self.logo_label)

        # App name
        self.app_name = QLabel("Inten")
        self.app_name.setStyleSheet(f"""
            font-size: 24px; 
            font-weight: 600; 
            color: {self.theme_manager.get_color("text_primary")};
        """)
        center_layout.addWidget(self.app_name)

        # Add the centered container to the main logo layout
        logo_layout.addWidget(center_container, alignment=Qt.AlignmentFlag.AlignCenter)
        menu_layout.addWidget(logo_container)

        # Menu buttons
        self.speech_recognition_button = MenuButton("Speech Recognition", 0)
        self.speech_recognition_button.setChecked(True)
        self.speech_recognition_button.clicked.connect(lambda: self.select_menu(0))
        menu_layout.addWidget(self.speech_recognition_button)

        # Add Language Model Settings button
        self.language_model_button = MenuButton("Language Model", 1)
        self.language_model_button.clicked.connect(lambda: self.select_menu(1))
        menu_layout.addWidget(self.language_model_button)

        # Add API Keys button
        self.api_keys_button = MenuButton("API Keys", 2)
        self.api_keys_button.clicked.connect(lambda: self.select_menu(2))
        menu_layout.addWidget(self.api_keys_button)

        self.mode_button = MenuButton("Mode", 3)
        self.mode_button.clicked.connect(lambda: self.select_menu(3))
        menu_layout.addWidget(self.mode_button)

        # Add Audio button
        self.audio_button = MenuButton("Audio", 4)
        self.audio_button.clicked.connect(lambda: self.select_menu(4))
        menu_layout.addWidget(self.audio_button)

        # Add Voice Detection button
        # self.voice_detection_button = MenuButton("Voice Detection", 5)
        # self.voice_detection_button.clicked.connect(lambda: self.select_menu(5))
        # menu_layout.addWidget(self.voice_detection_button)

        # Add Keyboard button
        self.keyboard_button = MenuButton("Keyboard", 5)
        self.keyboard_button.clicked.connect(lambda: self.select_menu(5))
        menu_layout.addWidget(self.keyboard_button)

        # Add Developer button
        self.developer_button = MenuButton("Developer", 6)
        self.developer_button.clicked.connect(lambda: self.select_menu(6))
        menu_layout.addWidget(self.developer_button)

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

        # --- Speech Recognition Settings page (no scroll area) ---
        self.speech_recognition_page = QWidget()
        speech_recognition_layout = QVBoxLayout(self.speech_recognition_page)
        speech_recognition_layout.setContentsMargins(0, 0, 0, 0)

        self.speech_recognition_title = QLabel("Speech Recognition")
        self.set_page_title_style(self.speech_recognition_title)
        speech_recognition_layout.addWidget(
            self.speech_recognition_title, alignment=Qt.AlignmentFlag.AlignLeft
        )

        # ASR form layout directly in the page (no scroll area)
        asr_form_content = QWidget()
        asr_form_layout = QFormLayout(asr_form_content)
        asr_form_layout.setSpacing(12)
        asr_form_layout.setContentsMargins(0, 0, 0, 0)
        asr_form_layout.setLabelAlignment(
            Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignTop
        )
        asr_form_layout.setFormAlignment(
            Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop
        )

        self.asr_source = SegmentedButtonGroup(
            ["openai_api", "faster_whisper", "groq_api", "gemini_api"]
        )
        asr_source_label = QLabel("ASR Provider")
        self.set_label_style(asr_source_label)
        asr_source_container = QWidget()
        asr_source_layout = QVBoxLayout(asr_source_container)
        asr_source_layout.setContentsMargins(0, 0, 0, 0)
        asr_source_layout.setSpacing(4)
        asr_source_layout.addWidget(asr_source_label)
        asr_source_layout.addWidget(self.asr_source)
        asr_form_layout.addRow(asr_source_container)

        self.asr_model_label = QLabel("ASR Model")
        self.openai_asr_model = SegmentedButtonGroup(["whisper-1"])
        openai_asr_model_label = QLabel("OpenAI Model")
        self.set_label_style(openai_asr_model_label)
        self.openai_asr_model_container = QWidget()
        openai_asr_model_layout = QVBoxLayout(self.openai_asr_model_container)
        openai_asr_model_layout.setContentsMargins(0, 0, 0, 0)
        openai_asr_model_layout.setSpacing(4)
        openai_asr_model_layout.addWidget(openai_asr_model_label)
        openai_asr_model_layout.addWidget(self.openai_asr_model)

        self.gemini_asr_model = SegmentedButtonGroup(["gemini-2.0-flash"])
        gemini_asr_model_label = QLabel("Gemini Model")
        self.set_label_style(gemini_asr_model_label)
        self.gemini_asr_model_container = QWidget()
        gemini_asr_model_layout = QVBoxLayout(self.gemini_asr_model_container)
        gemini_asr_model_layout.setContentsMargins(0, 0, 0, 0)
        gemini_asr_model_layout.setSpacing(4)
        gemini_asr_model_layout.addWidget(gemini_asr_model_label)
        gemini_asr_model_layout.addWidget(self.gemini_asr_model)

        self.faster_whisper_model = SegmentedButtonGroup(
            [
                "tiny",
                "base",
                "small",
                "medium",
                "large-v1",
                "large-v2",
                "large-v3",
            ]
        )
        faster_whisper_model_label = QLabel("Local Whisper Model")
        self.set_label_style(faster_whisper_model_label)
        self.faster_whisper_model_container = QWidget()
        faster_whisper_model_layout = QVBoxLayout(self.faster_whisper_model_container)
        faster_whisper_model_layout.setContentsMargins(0, 0, 0, 0)
        faster_whisper_model_layout.setSpacing(4)
        faster_whisper_model_layout.addWidget(faster_whisper_model_label)
        faster_whisper_model_layout.addWidget(self.faster_whisper_model)

        self.groq_asr_model = SegmentedButtonGroup(
            ["distil-whisper-large-v3-en", "whisper-large-v3-turbo", "whisper-large-v3"]
        )
        groq_asr_model_label = QLabel("Groq Model")
        self.set_label_style(groq_asr_model_label)
        self.groq_asr_model_container = QWidget()
        groq_asr_model_layout = QVBoxLayout(self.groq_asr_model_container)
        groq_asr_model_layout.setContentsMargins(0, 0, 0, 0)
        groq_asr_model_layout.setSpacing(4)
        groq_asr_model_layout.addWidget(groq_asr_model_label)
        groq_asr_model_layout.addWidget(self.groq_asr_model)

        asr_form_layout.addRow(self.openai_asr_model_container)
        asr_form_layout.addRow(self.gemini_asr_model_container)
        asr_form_layout.addRow(self.faster_whisper_model_container)
        asr_form_layout.addRow(self.groq_asr_model_container)
        self.openai_asr_model_container.show()
        self.faster_whisper_model_container.hide()
        self.groq_asr_model_container.hide()
        self.gemini_asr_model_container.hide()

        self.asr_device = SegmentedButtonGroup(["auto"])
        self.asr_device_label = QLabel("Device")
        self.set_label_style(self.asr_device_label)
        self.asr_device_container = QWidget()
        asr_device_layout = QVBoxLayout(self.asr_device_container)
        asr_device_layout.setContentsMargins(0, 0, 0, 0)
        asr_device_layout.setSpacing(4)
        asr_device_layout.addWidget(self.asr_device_label)
        asr_device_layout.addWidget(self.asr_device)
        asr_form_layout.addRow(self.asr_device_container)

        self.asr_compute_type = SegmentedButtonGroup(
            ["default", "int8", "int8_float16", "float16"]
        )
        self.asr_compute_type_label = QLabel("Compute Type")
        self.set_label_style(self.asr_compute_type_label)
        self.asr_compute_type_container = QWidget()
        asr_compute_type_layout = QVBoxLayout(self.asr_compute_type_container)
        asr_compute_type_layout.setContentsMargins(0, 0, 0, 0)
        asr_compute_type_layout.setSpacing(4)
        asr_compute_type_layout.addWidget(self.asr_compute_type_label)
        asr_compute_type_layout.addWidget(self.asr_compute_type)
        asr_form_layout.addRow(self.asr_compute_type_container)

        self.asr_source.selectionChanged.connect(self._update_asr_provider_fields)

        speech_recognition_layout.addWidget(asr_form_content)
        speech_recognition_layout.addStretch()

        # Add speech recognition page to stacked widget
        self.stacked_widget.addWidget(self.speech_recognition_page)

        # --- LLM PAGE ---
        self.language_model_page = QWidget()
        language_model_layout = QVBoxLayout(self.language_model_page)
        language_model_layout.setContentsMargins(0, 0, 0, 0)
        self.language_model_title = QLabel("Language Model Settings")
        self.set_page_title_style(self.language_model_title)
        language_model_layout.addWidget(
            self.language_model_title, alignment=Qt.AlignmentFlag.AlignLeft
        )

        llm_form_content = QWidget()
        llm_form_layout = QFormLayout(llm_form_content)
        llm_form_layout.setSpacing(16)
        llm_form_layout.setContentsMargins(0, 0, 0, 0)
        llm_form_layout.setLabelAlignment(
            Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter
        )
        llm_form_layout.setFormAlignment(
            Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter
        )

        self.llm_source = SegmentedButtonGroup(
            ["ollama", "openai_api", "groq_api", "gemini_api"]
        )
        llm_source_label = QLabel("LLM Source")
        self.set_label_style(llm_source_label)
        llm_source_container = QWidget()
        llm_source_layout = QVBoxLayout(llm_source_container)
        llm_source_layout.setContentsMargins(0, 0, 0, 0)
        llm_source_layout.setSpacing(4)
        llm_source_layout.addWidget(llm_source_label)
        llm_source_layout.addWidget(self.llm_source)
        llm_form_layout.addRow(llm_source_container)

        self.llm_model_edit = QLineEdit()
        self.llm_model_edit.setMaximumWidth(300)
        self.set_line_edit_style(self.llm_model_edit)
        llm_model_edit_label = QLabel("Ollama Model")
        self.set_label_style(llm_model_edit_label)
        self.llm_model_edit_container = QWidget()
        llm_model_edit_layout = QVBoxLayout(self.llm_model_edit_container)
        llm_model_edit_layout.setContentsMargins(0, 0, 0, 0)
        llm_model_edit_layout.setSpacing(4)
        llm_model_edit_layout.addWidget(llm_model_edit_label)
        llm_model_edit_layout.addWidget(self.llm_model_edit)

        self.openai_model = SegmentedButtonGroup(
            ["gpt-4.1", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"]
        )
        openai_model_label = QLabel("OpenAI Model")
        self.set_label_style(openai_model_label)
        self.openai_model_container = QWidget()
        openai_model_layout = QVBoxLayout(self.openai_model_container)
        openai_model_layout.setContentsMargins(0, 0, 0, 0)
        openai_model_layout.setSpacing(4)
        openai_model_layout.addWidget(openai_model_label)
        openai_model_layout.addWidget(self.openai_model)

        self.gemini_model = SegmentedButtonGroup(["gemini-2.0-flash"])
        gemini_model_label = QLabel("Gemini Model")
        self.set_label_style(gemini_model_label)
        self.gemini_model_container = QWidget()
        gemini_model_layout = QVBoxLayout(self.gemini_model_container)
        gemini_model_layout.setContentsMargins(0, 0, 0, 0)
        gemini_model_layout.setSpacing(4)
        gemini_model_layout.addWidget(gemini_model_label)
        gemini_model_layout.addWidget(self.gemini_model)

        self.groq_model = SegmentedButtonGroup(
            [
                "llama-3.3-70b-versatile",
                "llama3-70b-8192",
                "mixtral-8x7b-32768",
                "gemma-7b-it",
            ]
        )
        groq_model_label = QLabel("Groq Model")
        self.set_label_style(groq_model_label)
        self.groq_model_container = QWidget()
        groq_model_layout = QVBoxLayout(self.groq_model_container)
        groq_model_layout.setContentsMargins(0, 0, 0, 0)
        groq_model_layout.setSpacing(4)
        groq_model_layout.addWidget(groq_model_label)
        groq_model_layout.addWidget(self.groq_model)

        llm_form_layout.addRow(self.llm_model_edit_container)
        llm_form_layout.addRow(self.openai_model_container)
        llm_form_layout.addRow(self.groq_model_container)
        llm_form_layout.addRow(self.gemini_model_container)
        self.llm_model_edit_container.show()
        self.openai_model_container.hide()
        self.groq_model_container.hide()
        self.gemini_model_container.hide()

        # Max Tokens (define as self.max_tokens, then use in container)
        self.max_tokens = QSpinBox()
        self.max_tokens.setRange(1, 25000)
        self.max_tokens.setValue(2000)
        self.max_tokens.setStyleSheet("""
            QSpinBox {
                background-color: rgba(255, 255, 255, 0.07);
                padding: 8px 12px;
                border-radius: 8px;
                color: #FFFFFF;
                font-size: 15px;
            }
        """)
        self.max_tokens.setMaximumWidth(300)
        max_tokens_label = QLabel("Max Tokens")
        self.set_label_style(max_tokens_label)
        max_tokens_container = QWidget()
        max_tokens_layout = QVBoxLayout(max_tokens_container)
        max_tokens_layout.setContentsMargins(0, 0, 0, 0)
        max_tokens_layout.setSpacing(4)
        max_tokens_layout.addWidget(max_tokens_label)
        max_tokens_layout.addWidget(self.max_tokens)
        llm_form_layout.addRow(max_tokens_container)

        # Temperature (define as self.temperature, then use in container)
        self.temperature = QDoubleSpinBox()
        self.temperature.setRange(0.0, 1.0)
        self.temperature.setSingleStep(0.1)
        self.temperature.setValue(0.7)
        self.temperature.setStyleSheet("""
            QDoubleSpinBox {
                background-color: rgba(255, 255, 255, 0.07);
                padding: 8px 12px;
                border-radius: 8px;
                color: #FFFFFF;
                font-size: 15px;
            }
        """)
        self.temperature.setMaximumWidth(300)
        temperature_label = QLabel("Temperature")
        self.set_label_style(temperature_label)
        temperature_container = QWidget()
        temperature_layout = QVBoxLayout(temperature_container)
        temperature_layout.setContentsMargins(0, 0, 0, 0)
        temperature_layout.setSpacing(4)
        temperature_layout.addWidget(temperature_label)
        temperature_layout.addWidget(self.temperature)
        llm_form_layout.addRow(temperature_container)

        self.llm_source.selectionChanged.connect(self._update_llm_provider_fields)

        language_model_layout.addWidget(llm_form_content)
        language_model_layout.addStretch()
        self.stacked_widget.addWidget(self.language_model_page)

        # --- API Keys PAGE ---
        self.api_keys_page = QWidget()
        api_keys_layout = QVBoxLayout(self.api_keys_page)
        api_keys_layout.setContentsMargins(0, 0, 0, 0)
        self.api_keys_title = QLabel("API Keys")
        self.set_page_title_style(self.api_keys_title)
        api_keys_layout.addWidget(
            self.api_keys_title, alignment=Qt.AlignmentFlag.AlignLeft
        )

        # API Key fields (migrated from Settings page)
        self.openai_api_key_edit = QLineEdit()
        self.openai_api_key_edit.setEchoMode(QLineEdit.EchoMode.Password)
        self.openai_api_key_edit.setMaximumWidth(300)
        self.set_line_edit_style(self.openai_api_key_edit)
        openai_api_key_label = QLabel("OpenAI API Key")
        self.set_label_style(openai_api_key_label)
        openai_api_key_container = QWidget()
        openai_api_key_layout = QVBoxLayout(openai_api_key_container)
        openai_api_key_layout.setContentsMargins(0, 0, 0, 0)
        openai_api_key_layout.setSpacing(4)
        openai_api_key_layout.addWidget(openai_api_key_label)
        openai_api_key_layout.addWidget(self.openai_api_key_edit)
        api_keys_layout.addWidget(openai_api_key_container)

        self.gemini_api_key_edit = QLineEdit()
        self.gemini_api_key_edit.setEchoMode(QLineEdit.EchoMode.Password)
        self.gemini_api_key_edit.setMaximumWidth(300)
        self.set_line_edit_style(self.gemini_api_key_edit)
        gemini_api_key_label = QLabel("Gemini API Key")
        self.set_label_style(gemini_api_key_label)
        gemini_api_key_container = QWidget()
        gemini_api_key_layout = QVBoxLayout(gemini_api_key_container)
        gemini_api_key_layout.setContentsMargins(0, 0, 0, 0)
        gemini_api_key_layout.setSpacing(4)
        gemini_api_key_layout.addWidget(gemini_api_key_label)
        gemini_api_key_layout.addWidget(self.gemini_api_key_edit)
        api_keys_layout.addWidget(gemini_api_key_container)

        self.groq_api_key_edit = QLineEdit()
        self.groq_api_key_edit.setEchoMode(QLineEdit.EchoMode.Password)
        self.groq_api_key_edit.setMaximumWidth(300)
        self.set_line_edit_style(self.groq_api_key_edit)
        groq_api_key_label = QLabel("Groq API Key")
        self.set_label_style(groq_api_key_label)
        groq_api_key_container = QWidget()
        groq_api_key_layout = QVBoxLayout(groq_api_key_container)
        groq_api_key_layout.setContentsMargins(0, 0, 0, 0)
        groq_api_key_layout.setSpacing(4)
        groq_api_key_layout.addWidget(groq_api_key_label)
        groq_api_key_layout.addWidget(self.groq_api_key_edit)
        api_keys_layout.addWidget(groq_api_key_container)

        api_keys_layout.addStretch()
        self.stacked_widget.addWidget(self.api_keys_page)

        self.mode_page = QWidget()
        mode_layout = QVBoxLayout(self.mode_page)
        mode_layout.setContentsMargins(0, 0, 0, 0)
        self.mode_title = QLabel("Mode")
        self.set_page_title_style(self.mode_title)
        mode_layout.addWidget(self.mode_title, alignment=Qt.AlignmentFlag.AlignLeft)

        # Mode Section
        application_mode_label = QLabel("Application Mode:")
        self.set_label_style(application_mode_label)
        application_mode_container = QWidget()
        application_mode_layout = QVBoxLayout(application_mode_container)
        application_mode_layout.setContentsMargins(0, 0, 0, 0)
        application_mode_layout.setSpacing(4)
        application_mode_layout.addWidget(application_mode_label)
        self.application_mode_selector = SegmentedButtonGroup(
            ["discrete", "streaming", "oneshot"]
        )
        application_mode_layout.addWidget(self.application_mode_selector)
        mode_layout.addWidget(application_mode_container)

        # Vosk Section
        self.vosk_model_path_edit = QLineEdit()
        self.vosk_model_path_edit.setMaximumWidth(300)
        self.set_line_edit_style(self.vosk_model_path_edit)
        vosk_model_path_label = QLabel("Model Path")
        self.set_label_style(vosk_model_path_label)
        self.vosk_model_path_container = QWidget()
        self.vosk_model_path_container.setObjectName("vosk_model_path_container")
        vosk_model_path_layout = QVBoxLayout(self.vosk_model_path_container)
        vosk_model_path_layout.setContentsMargins(0, 0, 0, 0)
        vosk_model_path_layout.setSpacing(4)
        vosk_model_path_layout.addWidget(vosk_model_path_label)
        vosk_model_path_layout.addWidget(self.vosk_model_path_edit)
        mode_layout.addWidget(self.vosk_model_path_container)

        mode_layout.addStretch()
        self.stacked_widget.addWidget(self.mode_page)

        # --- Audio PAGE ---
        self.audio_page = QWidget()
        audio_layout = QVBoxLayout(self.audio_page)
        audio_layout.setContentsMargins(0, 0, 0, 0)
        self.audio_title = QLabel("Audio")
        self.set_page_title_style(self.audio_title)
        audio_layout.addWidget(self.audio_title, alignment=Qt.AlignmentFlag.AlignLeft)

        # Audio Section
        self.sample_rate = SegmentedButtonGroup(
            ["8000", "16000", "22050", "44100", "48000"]
        )
        sample_rate_label = QLabel("Sample Rate")
        self.set_label_style(sample_rate_label)
        sample_rate_container = QWidget()
        sample_rate_layout = QVBoxLayout(sample_rate_container)
        sample_rate_layout.setContentsMargins(0, 0, 0, 0)
        sample_rate_layout.setSpacing(4)
        sample_rate_layout.addWidget(sample_rate_label)
        sample_rate_layout.addWidget(self.sample_rate)
        audio_layout.addWidget(sample_rate_container)

        self.channels = SegmentedButtonGroup(["1", "2"])
        channels_label = QLabel("Channels")
        self.set_label_style(channels_label)
        channels_container = QWidget()
        channels_layout = QVBoxLayout(channels_container)
        channels_layout.setContentsMargins(0, 0, 0, 0)
        channels_layout.setSpacing(4)
        channels_layout.addWidget(channels_label)
        channels_layout.addWidget(self.channels)
        audio_layout.addWidget(channels_container)

        audio_layout.addStretch()
        self.stacked_widget.addWidget(self.audio_page)

        # --- Menu panel and divider container ---
        menu_container = QWidget()
        menu_container_layout = QVBoxLayout(menu_container)
        menu_container_layout.setContentsMargins(0, 0, 0, 0)
        menu_container_layout.setSpacing(0)
        menu_container_layout.addWidget(menu_panel)
        main_layout.addWidget(menu_container)
        main_layout.addWidget(content_widget)

        # Start application if settings are valid
        current_settings = self.app_manager.load_settings()
        if current_settings:  # Only validate if we have settings
            is_valid, error_msg = self.app_manager.validate_settings(current_settings)
            if is_valid:
                self.app_manager.start_application()
            else:
                self.handle_error(error_msg)

        # --- Unified Global Styles for Home Window ---
        self.setStyleSheet(
            self.styleSheet()
            + """
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
        """
        )

        # --- Voice Detection PAGE ---
        # self.voice_detection_page = QWidget()
        # voice_detection_layout = QVBoxLayout(self.voice_detection_page)
        # voice_detection_layout.setContentsMargins(0, 0, 0, 0)
        # self.voice_detection_title = QLabel("Voice Detection")
        # self.set_page_title_style(self.voice_detection_title)
        # voice_detection_layout.addWidget(
        #     self.voice_detection_title, alignment=Qt.AlignmentFlag.AlignLeft
        # )

        # # VAD Section (migrated from Settings page)
        # self.vad_enabled = SegmentedButtonGroup(["Enabled", "Disabled"])
        # vad_enabled_label = QLabel("Voice Activity Detection")
        # self.set_label_style(vad_enabled_label)
        # vad_enabled_container = QWidget()
        # vad_enabled_layout = QVBoxLayout(vad_enabled_container)
        # vad_enabled_layout.setContentsMargins(0, 0, 0, 0)
        # vad_enabled_layout.setSpacing(4)
        # vad_enabled_layout.addWidget(vad_enabled_label)
        # vad_enabled_layout.addWidget(self.vad_enabled)
        # voice_detection_layout.addWidget(vad_enabled_container)

        # self.vad_aggressiveness = SegmentedButtonGroup(["0", "1", "2", "3"])
        # vad_aggressiveness_label = QLabel("Aggressiveness")
        # self.set_label_style(vad_aggressiveness_label)
        # vad_aggressiveness_container = QWidget()
        # vad_aggressiveness_layout = QVBoxLayout(vad_aggressiveness_container)
        # vad_aggressiveness_layout.setContentsMargins(0, 0, 0, 0)
        # vad_aggressiveness_layout.setSpacing(4)
        # vad_aggressiveness_layout.addWidget(vad_aggressiveness_label)
        # vad_aggressiveness_layout.addWidget(self.vad_aggressiveness)
        # voice_detection_layout.addWidget(vad_aggressiveness_container)

        # self.silence_duration = SegmentedButtonGroup(
        #     ["100", "500", "1000", "2000", "5000"]
        # )
        # silence_duration_label = QLabel("Silence Duration (ms)")
        # self.set_label_style(silence_duration_label)
        # silence_duration_container = QWidget()
        # silence_duration_layout = QVBoxLayout(silence_duration_container)
        # silence_duration_layout.setContentsMargins(0, 0, 0, 0)
        # silence_duration_layout.setSpacing(4)
        # silence_duration_layout.addWidget(silence_duration_label)
        # silence_duration_layout.addWidget(self.silence_duration)
        # voice_detection_layout.addWidget(silence_duration_container)

        # self.frame_duration = SegmentedButtonGroup(["10", "20", "30"])
        # frame_duration_label = QLabel("Frame Duration (ms)")
        # self.set_label_style(frame_duration_label)
        # frame_duration_container = QWidget()
        # frame_duration_layout = QVBoxLayout(frame_duration_container)
        # frame_duration_layout.setContentsMargins(0, 0, 0, 0)
        # frame_duration_layout.setSpacing(4)
        # frame_duration_layout.addWidget(frame_duration_label)
        # frame_duration_layout.addWidget(self.frame_duration)
        # voice_detection_layout.addWidget(frame_duration_container)

        # voice_detection_layout.addStretch()
        # self.stacked_widget.addWidget(self.voice_detection_page)

        # --- Keyboard PAGE ---
        self.keyboard_page = QWidget()
        keyboard_layout = QVBoxLayout(self.keyboard_page)
        keyboard_layout.setContentsMargins(0, 0, 0, 0)
        self.keyboard_title = QLabel("Keyboard")
        self.set_page_title_style(self.keyboard_title)
        keyboard_layout.addWidget(
            self.keyboard_title, alignment=Qt.AlignmentFlag.AlignLeft
        )

        # Create form layout directly in the keyboard page
        keyboard_form_layout = QFormLayout()
        keyboard_form_layout.setSpacing(16)
        keyboard_form_layout.setContentsMargins(0, 0, 0, 0)
        keyboard_form_layout.setLabelAlignment(
            Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter
        )
        keyboard_form_layout.setFormAlignment(
            Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter
        )

        # Output Section
        self.output_method = SegmentedButtonGroup(["typewrite"])
        output_method_label = QLabel("Output Method")
        self.set_label_style(output_method_label)
        output_method_container = QWidget()
        output_method_layout = QVBoxLayout(output_method_container)
        output_method_layout.setContentsMargins(0, 0, 0, 0)
        output_method_layout.setSpacing(4)
        output_method_layout.addWidget(output_method_label)
        output_method_layout.addWidget(self.output_method)
        keyboard_form_layout.addRow(output_method_container)

        # Hotkeys Section
        self.dictation_hotkey = QLineEdit()
        self.dictation_hotkey.setMaximumWidth(300)
        self.set_line_edit_style(self.dictation_hotkey)
        self.dictation_hotkey.setReadOnly(
            True
        )  # Make it read-only since we'll handle input differently
        dictation_hotkey_label = QLabel("Dictation Hotkey")
        self.set_label_style(dictation_hotkey_label)
        dictation_hotkey_container = QWidget()
        dictation_hotkey_layout = QVBoxLayout(dictation_hotkey_container)
        dictation_hotkey_layout.setContentsMargins(0, 0, 0, 0)
        dictation_hotkey_layout.setSpacing(4)
        dictation_hotkey_layout.addWidget(dictation_hotkey_label)
        dictation_hotkey_layout.addWidget(self.dictation_hotkey)
        keyboard_form_layout.addRow(dictation_hotkey_container)

        # Container for both start/stop buttons
        dictation_button_container = QWidget()
        dictation_button_layout = QHBoxLayout(dictation_button_container)
        dictation_button_layout.setContentsMargins(0, 0, 0, 0)
        dictation_button_layout.setSpacing(10)

        self.start_recording_dictation = QPushButton("Start Recording")
        self.set_primary_button_style(self.start_recording_dictation)
        self.start_recording_dictation.clicked.connect(
            lambda: self.start_hotkey_recording(
                self.start_recording_dictation,
                self.stop_recording_dictation,
                self.dictation_hotkey,
            )
        )
        dictation_button_layout.addWidget(self.start_recording_dictation)

        self.stop_recording_dictation = QPushButton("Stop Recording")
        self.set_primary_button_style(self.stop_recording_dictation)
        self.stop_recording_dictation.setVisible(False)
        self.stop_recording_dictation.clicked.connect(
            lambda: self.stop_hotkey_recording(
                self.start_recording_dictation,
                self.stop_recording_dictation,
                self.dictation_hotkey,
            )
        )
        dictation_button_layout.addWidget(self.stop_recording_dictation)

        dictation_button_layout.addStretch()

        keyboard_form_layout.addRow(dictation_button_container)

        self.action_hotkey = QLineEdit()
        self.action_hotkey.setMaximumWidth(300)
        self.set_line_edit_style(self.action_hotkey)
        self.action_hotkey.setReadOnly(
            True
        )  # Make it read-only since we'll handle input differently

        action_hotkey_label = QLabel("Action Hotkey")
        self.set_label_style(action_hotkey_label)
        action_hotkey_container = QWidget()
        action_hotkey_layout = QVBoxLayout(action_hotkey_container)
        action_hotkey_layout.setContentsMargins(0, 0, 0, 0)
        action_hotkey_layout.setSpacing(4)
        action_hotkey_layout.addWidget(action_hotkey_label)
        action_hotkey_layout.addWidget(self.action_hotkey)
        keyboard_form_layout.addRow(action_hotkey_container)

        # Container for both start/stop buttons
        action_button_container = QWidget()
        action_button_layout = QHBoxLayout(action_button_container)
        action_button_layout.setContentsMargins(0, 0, 0, 0)
        action_button_layout.setSpacing(10)

        self.start_recording_action = QPushButton("Start Recording")
        self.set_primary_button_style(self.start_recording_action)
        self.start_recording_action.clicked.connect(
            lambda: self.start_hotkey_recording(
                self.start_recording_action,
                self.stop_recording_action,
                self.action_hotkey,
            )
        )
        action_button_layout.addWidget(self.start_recording_action)

        self.stop_recording_action = QPushButton("Stop Recording")
        self.set_primary_button_style(self.stop_recording_action)
        self.stop_recording_action.setVisible(False)
        self.stop_recording_action.clicked.connect(
            lambda: self.stop_hotkey_recording(
                self.start_recording_action,
                self.stop_recording_action,
                self.action_hotkey,
            )
        )
        action_button_layout.addWidget(self.stop_recording_action)

        action_button_layout.addStretch()

        keyboard_form_layout.addRow(action_button_container)

        # Add keyboard listening functionality
        self._last_pressed_keys = None
        self.recording_qline_edit = self.dictation_hotkey
        self.keyboard_poll_timer = QTimer(self)
        self.keyboard_poll_timer.timeout.connect(self.poll_pressed_keys)

        keyboard_layout.addLayout(keyboard_form_layout)
        keyboard_layout.addStretch()
        self.stacked_widget.addWidget(self.keyboard_page)

        # --- Developer PAGE ---
        self.developer_page = QWidget()
        developer_layout = QVBoxLayout(self.developer_page)
        developer_layout.setContentsMargins(0, 0, 0, 0)
        self.developer_title = QLabel("Developer")
        self.set_page_title_style(self.developer_title)
        developer_layout.addWidget(
            self.developer_title, alignment=Qt.AlignmentFlag.AlignLeft
        )

        # Create form layout directly in the developer page
        developer_form_layout = QFormLayout()
        developer_form_layout.setSpacing(16)
        developer_form_layout.setContentsMargins(0, 0, 0, 0)
        developer_form_layout.setLabelAlignment(
            Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter
        )
        developer_form_layout.setFormAlignment(
            Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter
        )

        # Developer Timing Tools Section
        self.add_section_header(
            developer_form_layout,
            "Developer Timing Tools",
            color=self.theme_manager.get_color("text_primary"),
        )

        # Timing report buttons container
        timing_buttons_widget = QWidget()
        timing_button_layout = QHBoxLayout(timing_buttons_widget)
        timing_button_layout.setContentsMargins(0, 0, 0, 0)
        timing_button_layout.setSpacing(10)

        self.save_timing_report_button = QPushButton("Save Timing Report")
        self.set_primary_button_style(self.save_timing_report_button)
        self.save_timing_report_button.clicked.connect(self.handle_save_timing_report)
        timing_button_layout.addWidget(self.save_timing_report_button)

        self.clear_timing_data_button = QPushButton("Clear Timing Data")
        self.set_primary_button_style(self.clear_timing_data_button)
        self.clear_timing_data_button.clicked.connect(self.handle_clear_timing_data)
        timing_button_layout.addWidget(self.clear_timing_data_button)

        timing_button_layout.addStretch()  # Push buttons to the left

        # Add the widget containing the buttons to the form layout
        developer_form_layout.addRow(timing_buttons_widget)

        # Reset All Section
        self.add_section_header(
            developer_form_layout,
            "Reset Settings",
            color=self.theme_manager.get_color("text_primary"),
        )

        # Reset All button container
        reset_button_widget = QWidget()
        reset_button_layout = QHBoxLayout(reset_button_widget)
        reset_button_layout.setContentsMargins(0, 0, 0, 0)
        reset_button_layout.setSpacing(10)

        reset_button = QPushButton("Reset All")
        self.set_primary_button_style(reset_button)
        reset_button.clicked.connect(self.reset_all_settings)
        reset_button_layout.addWidget(reset_button)
        reset_button_layout.addStretch()  # Push button to the left

        # Add the reset button widget to the form layout
        developer_form_layout.addRow(reset_button_widget)

        developer_layout.addLayout(developer_form_layout)
        developer_layout.addStretch()
        self.stacked_widget.addWidget(self.developer_page)

        # Connect signals for auto-save
        # API Keys
        self.openai_api_key_edit.textChanged.connect(self.save_settings)
        self.gemini_api_key_edit.textChanged.connect(self.save_settings)
        self.groq_api_key_edit.textChanged.connect(self.save_settings)

        # ASR Settings
        self.asr_source.selectionChanged.connect(self.save_settings)
        self.asr_source.selectionChanged.connect(self.update_setting_visibility)
        self.openai_asr_model.selectionChanged.connect(self.save_settings)
        self.gemini_asr_model.selectionChanged.connect(self.save_settings)
        self.groq_asr_model.selectionChanged.connect(self.save_settings)
        self.faster_whisper_model.selectionChanged.connect(self.save_settings)
        self.asr_device.selectionChanged.connect(self.save_settings)
        self.asr_compute_type.selectionChanged.connect(self.save_settings)

        # LLM Settings
        self.llm_source.selectionChanged.connect(self._handle_llm_source_change)
        self.llm_model_edit.textChanged.connect(self.save_settings)
        self.openai_model.selectionChanged.connect(self.save_settings)
        self.groq_model.selectionChanged.connect(self.save_settings)
        self.gemini_model.selectionChanged.connect(self.save_settings)
        self.max_tokens.valueChanged.connect(self.save_settings)
        self.temperature.valueChanged.connect(self.save_settings)

        # Audio Settings
        self.sample_rate.selectionChanged.connect(self.save_settings)
        self.channels.selectionChanged.connect(self.save_settings)

        # VAD Settings
        # self.vad_enabled.selectionChanged.connect(self.save_settings)
        # self.vad_aggressiveness.selectionChanged.connect(self.save_settings)
        # self.silence_duration.selectionChanged.connect(self.save_settings)
        # self.frame_duration.selectionChanged.connect(self.save_settings)

        # Output Settings
        self.output_method.selectionChanged.connect(self.save_settings)

        # Hotkey Settings
        self.dictation_hotkey.textChanged.connect(self.save_settings)
        self.action_hotkey.textChanged.connect(self.save_settings)

        # Mode Settings
        self.application_mode_selector.selectionChanged.connect(self._handle_ui_change)
        self.vosk_model_path_edit.textChanged.connect(self.save_settings)

        # Load settings after UI is fully initialized
        QTimer.singleShot(100, self.load_settings)
        QTimer.singleShot(200, self.update_setting_visibility)

        # Start application if settings are valid
        current_settings = self.app_manager.load_settings()
        if current_settings:  # Only validate if we have settings
            is_valid, error_msg = self.app_manager.validate_settings(current_settings)
            if is_valid:
                self.app_manager.start_application()
            else:
                self.handle_error(error_msg)

    def update_styles(self, new_theme):
        """Update the styles of the window"""
        # Update logo
        logo_path = self.theme_manager.get_logo_path()
        if logo_path:
            logo_pixmap = QPixmap(logo_path)
            if not logo_pixmap.isNull():
                scaled_pixmap = logo_pixmap.scaled(
                    32,
                    32,
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation,
                )
                self.logo_label.setPixmap(scaled_pixmap)
                self.logo_label.setText("")
            else:
                self.logo_label.setPixmap(QPixmap())
                self.logo_label.setText("🎯")
        else:
            self.logo_label.setPixmap(QPixmap())
            self.logo_label.setText("🎯")

        # Update app name color
        self.app_name.setStyleSheet(f"""
            font-size: 24px; 
            font-weight: 600; 
            color: {self.theme_manager.get_color("text_primary")};
        """)

        # Update all page title colors using the helper
        for label in [
            self.speech_recognition_title,
            self.language_model_title,
            self.api_keys_title,
            self.mode_title,
            self.audio_title,
            self.voice_detection_title,
            self.keyboard_title,
            self.developer_title,
        ]:
            self.set_page_title_style(label)

        # Update all themed labels
        if hasattr(self, "_themed_labels"):
            for label in self._themed_labels:
                self.set_label_style(label)

        # Update all primary buttons in developer page
        for button in [
            self.save_timing_report_button,
            self.clear_timing_data_button,
        ]:
            self.set_primary_button_style(button)
        # Find and update the reset button in the developer page
        for widget in self.developer_page.findChildren(QPushButton):
            if widget.text() == "Reset All":
                self.set_primary_button_style(widget)

        # Update all section headers to use the current theme color
        for layout in [
            # Add all layouts where section headers are used
            getattr(self, "developer_page", None),
            getattr(self, "keyboard_page", None),
        ]:
            if layout:
                for widget in layout.findChildren(QLabel):
                    if widget.text() in [
                        "Developer Timing Tools",
                        "Reset Settings",
                        "Output Settings",
                        "Hotkey Settings",
                    ]:
                        self.set_label_style(
                            widget,
                            color=self.theme_manager.get_color("text_primary"),
                            font_size=15,
                            font_weight=600,
                        )

    def select_menu(self, index):
        # If we're leaving the keyboard page, stop recording
        if self.stacked_widget.currentWidget() == self.keyboard_page:
            self.is_recording_hotkey = False
            self._last_pressed_keys = None
        # Switch to the selected page
        self.stacked_widget.setCurrentIndex(index)
        self.speech_recognition_button.setChecked(index == 0)
        self.language_model_button.setChecked(index == 1)
        self.api_keys_button.setChecked(index == 2)
        self.mode_button.setChecked(index == 3)
        self.audio_button.setChecked(index == 4)
        # self.voice_detection_button.setChecked(index == 5)
        self.keyboard_button.setChecked(index == 5)
        self.developer_button.setChecked(index == 6)

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
            logger.error(f"Error saving timing report: {traceback.format_exc()}")

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
            logger.error(f"Error clearing timing data: {traceback.format_exc()}")

    def reset_all_settings(self):
        """Reset all settings and restart the onboarding process."""
        # Clear all settings
        settings = QSettings(
            OnboardingWindow.ORGANIZATION_NAME, OnboardingWindow.APPLICATION_NAME
        )
        settings.clear()
        settings.sync()  # Ensure settings are saved

        # Create and show new onboarding window
        self.onboarding_window = OnboardingWindow(theme_manager=self.theme_manager)
        self.onboarding_window.show()

        # Close the current window
        self.hide()

    def add_section_header(self, layout, text, color=None):
        """Helper method to add styled section headers and a horizontal divider to the form"""
        # Add horizontal divider before each section except the first
        if layout.rowCount() > 0:
            divider = QFrame()
            divider.setFrameShape(QFrame.Shape.HLine)
            divider.setFixedHeight(1)
            divider.setStyleSheet(
                f"background: rgba(242, 228, 214, 0.3); border: none; margin-top: 16px; margin-bottom: 16px; color: {color or self.theme_manager.get_color('text_primary')};"
            )
            layout.addRow(divider)
        header = QLabel(text)
        header.setStyleSheet(f"""
            font-size: 15px;
            font-weight: 600;
            color: {color or self.theme_manager.get_color("text_primary")};
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
        """Debounced version of save_settings that waits for user to stop typing"""
        self.save_settings_timer.start(500)  # 500ms delay

    def _save_settings_impl(self):
        """Actual implementation of save_settings"""
        logger.info("[Saving Settings] Starting save process")
        try:
            llm_source_value = self.llm_source.currentText()
            logger.debug(f"LLM Source: {llm_source_value}")

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
            selected_application_mode = self.application_mode_selector.currentText()

            if selected_application_mode == "streaming" and not vosk_model_path_value:
                self.handle_error(
                    "Vosk Model Path cannot be empty when Streaming Mode is enabled."
                )
                return

            asr_source_value = self.asr_source.currentText()
            current_asr_provider_model_value = ""
            current_asr_local_model_size = self.faster_whisper_model.currentText()

            openai_client_asr_model = (
                self.openai_asr_model.currentText()
            )  # Default for OpenAI client
            groq_client_asr_model = (
                self.groq_asr_model.currentText()
            )  # Default for Groq client
            gemini_client_asr_model = self.gemini_asr_model.currentText()

            if asr_source_value == "openai_api":
                current_asr_provider_model_value = self.openai_asr_model.currentText()
                openai_client_asr_model = (
                    current_asr_provider_model_value  # Sync if OpenAI is ASR provider
                )
            elif asr_source_value == "gemini_api":
                current_asr_provider_model_value = self.gemini_asr_model.currentText()
                gemini_client_asr_model = (
                    current_asr_provider_model_value  # Sync if Gemini is ASR provider
                )
            elif asr_source_value == "groq_api":
                current_asr_provider_model_value = self.groq_asr_model.currentText()
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
                    "sample_rate": int(self.sample_rate.currentText()),
                    "channels": int(self.channels.currentText()),
                },
                "VAD": {
                    "enabled": False,
                    "aggressiveness": 1,
                    "silence_duration_ms": 500,
                    "frame_duration_ms": 30,
                },
                "Output": {
                    "method": self.output_method.currentText(),
                },
                "Hotkeys": {
                    "action_hotkey": self.action_hotkey.text(),
                    "dictation_hotkey": self.dictation_hotkey.text(),
                },
                "Mode": {"application_mode": selected_application_mode},
            }

            # Validate new settings
            is_valid, error_msg = self.app_manager.validate_settings(new_settings)
            logger.debug(
                f"[Saving Settings] Is valid: {is_valid}, Error message: {error_msg}"
            )
            if not is_valid:
                self.handle_error(error_msg)
                return

            # Save settings
            self.app_manager.save_settings(new_settings)
        except Exception as e:
            logger.error(f"[Saving Settings] Error: {str(e)}")
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

            self.max_tokens.setValue(config["LLM"]["max_tokens"])
            self.temperature.setValue(config["LLM"]["temperature"])

            # Call to update dynamic LLM fields
            self._update_llm_provider_fields()

            # Load Audio settings
            self.sample_rate.setCurrentText(str(config["Audio"]["sample_rate"]))
            self.channels.setCurrentText(str(config["Audio"]["channels"]))

            # Load Output settings
            self.output_method.setCurrentText(config["Output"]["method"])

            # Load Hotkey settings
            self.dictation_hotkey.setText(config["Hotkeys"]["dictation_hotkey"])

            self.action_hotkey.setText(config["Hotkeys"]["action_hotkey"])

            # Load Mode settings
            mode_config = config.get("Mode", {})
            self.application_mode_selector.setCurrentText(
                mode_config.get("application_mode", "discrete")
            )

            # Load Vosk settings (Path is now guaranteed by ApplicationManager)
            vosk_config = config.get("Vosk", {})
            vosk_path_from_config = vosk_config.get("model_path")
            self.vosk_model_path_edit.setText(
                vosk_path_from_config if vosk_path_from_config else ""
            )

            self._apply_ui_restrictions()
            self._sync_active_llm_model_value()  # Ensure LLM model value is synced after rules are applied

        except Exception as e:
            logger.error(f"Error in load_settings: {str(e)}")
            logger.error(f"Error details: {traceback.format_exc()}")
            self.handle_error(f"Failed to load settings: {str(e)}")

        # After all UI visibility/state changes, sync the active LLM model value field
        self._sync_active_llm_model_value()

    def closeEvent(self, event):
        """Handle window close event"""
        logger.info("Closing Home window")
        self.keyboard_manager.cleanup()
        self.app_manager.stop_application()
        # Hide status window
        if hasattr(self.app_manager, "status_window"):
            self.app_manager.status_window.hide()
        super().closeEvent(event)

    def hideEvent(self, event):
        """Handle window hide event"""
        logger.info("Hiding Home window")
        self.app_manager.stop_application()
        if hasattr(self.app_manager, "status_window"):
            self.app_manager.status_window.hide()
        super().hideEvent(event)

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
            default_gemini_model = config.get("Gemini", {}).get(
                "model", "gemini-2.0-flash"
            )
            default_groq_model = config.get("Groq", {}).get(
                "model", "llama-3.3-70b-versatile"
            )
            default_ollama_model = config.get("Ollama", {}).get(
                "model", "llama3.2:latest"
            )

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
                openai_specific_model = config.get("OpenAI", {}).get(
                    "user_command_model", default_openai_model
                )
                model_to_set = (
                    llm_config_model
                    if llm_config_model
                    and llm_config_model in self.openai_model.buttons
                    else openai_specific_model
                )
                self.openai_model.setCurrentText(model_to_set)
            elif llm_source == "gemini_api":
                self.gemini_model_container.show()
                # Use user_command_model from Gemini section, then LLM/model, then default
                gemini_specific_model = config.get("Gemini", {}).get(
                    "user_command_model", default_gemini_model
                )
                model_to_set = (
                    llm_config_model
                    if llm_config_model
                    and llm_config_model in self.gemini_model.buttons
                    else gemini_specific_model
                )
                self.gemini_model.setCurrentText(model_to_set)
            elif llm_source == "groq_api":
                self.groq_model_container.show()
                # Use user_command_model from Groq section, then LLM/model, then default
                groq_specific_model = config.get("Groq", {}).get(
                    "user_command_model", default_groq_model
                )
                model_to_set = (
                    llm_config_model
                    if llm_config_model and llm_config_model in self.groq_model.buttons
                    else groq_specific_model
                )
                self.groq_model.setCurrentText(model_to_set)
            else:  # ollama or unknown source
                self.llm_model_edit_container.show()
                self.llm_model_edit.setText(
                    llm_config_model if llm_config_model else default_ollama_model
                )

        finally:
            # Unblock signals
            self.llm_model_edit.blockSignals(False)
            self.openai_model.blockSignals(False)
            self.groq_model.blockSignals(False)
            self.gemini_model.blockSignals(False)

    def update_setting_visibility(self):
        is_local_asr = self.asr_source.currentText() == "faster_whisper"
        set_widget_hidden_but_take_space(self.asr_device_container, not is_local_asr)
        set_widget_hidden_but_take_space(
            self.asr_compute_type_container, not is_local_asr
        )

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
                    if current_asr_model_setting
                    and current_asr_model_setting in self.openai_asr_model.buttons
                    else openai_default
                )
                self.openai_asr_model.setCurrentText(model_to_set)
                self.asr_model_label.setText("ASR Model (OpenAI):")
            elif asr_source == "gemini_api":
                self.gemini_asr_model_container.show()
                gemini_default = config.get("Gemini", {}).get(
                    "asr_model", "gemini-2.0-flash"
                )
                model_to_set = (
                    current_asr_model_setting
                    if current_asr_model_setting
                    and current_asr_model_setting in self.gemini_asr_model.buttons
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
                groq_default = config.get("Groq", {}).get(
                    "asr_model", "distil-whisper-large-v3-en"
                )
                model_to_set = (
                    current_asr_model_setting
                    if current_asr_model_setting
                    and current_asr_model_setting in self.groq_asr_model.buttons
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
        finally:
            self.openai_asr_model.blockSignals(False)
            self.faster_whisper_model.blockSignals(False)
            self.groq_asr_model.blockSignals(False)

    def set_page_title_style(self, label):
        label.setStyleSheet(f"""
            font-size: 24px;
            font-weight: 600;
            color: {self.theme_manager.get_color("text_primary")};
            margin-bottom: 28px;
            margin-left: 0px;
        """)

    def set_line_edit_style(self, line_edit):
        line_edit.setStyleSheet("""
            QLineEdit {
                background-color: rgba(255, 255, 255, 0.15);
                padding: 8px 12px;
                border-radius: 8px;
            }
        """)

    def set_label_style(
        self, label, *, color=None, font_size=13, padding="8px 0px", font_weight=None
    ):
        if not hasattr(self, "_themed_labels"):
            self._themed_labels = []
        if label not in self._themed_labels:
            self._themed_labels.append(label)
        label_color = color or self.theme_manager.get_color("text_primary")
        weight = f"font-weight: {font_weight};" if font_weight else ""
        label.setStyleSheet(f"""
            font-size: {font_size}px;
            color: {label_color};
            padding: {padding};
            {weight}
        """)

    def set_primary_button_style(self, button):
        background = self.theme_manager.get_color("button.background")
        text = self.theme_manager.get_color("button.text")
        button.setStyleSheet(f"""
            QPushButton {{
                background-color: {background};
                color: {text};
                border: none;
                border-radius: 8px;
                font-size: 12px;
                font-weight: 600;
                padding: 0 14px;
                min-height: 44px;
                min-width: 160px;
                letter-spacing: 0.2px;
            }}
            QPushButton:hover {{
                background-color: {background};
                opacity: 0.9;
            }}
        """)

    def _handle_ui_change(self):
        """Handle changes in application mode selection or other UI elements that drive restrictions."""
        self._apply_ui_restrictions()  # Apply all defined UI restrictions
        self.save_settings()  # Save settings as application_mode changed,
        # and potentially other settings due to restrictions.

    def _apply_ui_restrictions(self):
        """Apply all UI restrictions defined in UI_RESTRICTIONS."""
        # Collect all unique widget names that are targets of actions to manage signal blocking
        # For now, we know llm_source is a primary one needing signal management for its dependent updates.
        widgets_to_manage_signals = set()
        for rule_config in Home.UI_RESTRICTIONS:
            for action_list_key in ["then_actions", "else_actions"]:
                if action_list_key in rule_config:
                    for action_detail in rule_config[action_list_key]:
                        # Specifically looking for widgets that might trigger cascading updates
                        # like _update_llm_provider_fields if their state is programmatically changed.
                        if action_detail["target_widget_name"] == "llm_source":
                            widgets_to_manage_signals.add(
                                action_detail["target_widget_name"]
                            )

        # Block signals for widgets that have dependent UI updates triggered by their changes
        for widget_name in widgets_to_manage_signals:
            widget = getattr(self, widget_name, None)
            if widget and hasattr(widget, "blockSignals"):
                widget.blockSignals(True)

        # --- Pass 0: Set default states for widgets before specific rules are applied ---
        # This ensures that if no rule actively changes a state, it reverts to a known default.
        self.speech_recognition_button.setEnabled(True)
        # Add other widgets here if they follow a similar pattern of default state + specific overrides

        # --- Pass 1: Apply defaults or reset states for certain widget types before rules ---
        # For SegmentedButtonGroups that could be targets of "force_selection" or "disable_options",
        # it's often cleaner to enable all their options first.
        # This makes "else_actions" for these simpler (often just "enable_all_options").
        for rule_config in Home.UI_RESTRICTIONS:
            for action_list_key in ["then_actions", "else_actions"]:
                if action_list_key in rule_config:
                    for action_detail in rule_config[action_list_key]:
                        target_widget = getattr(
                            self, action_detail["target_widget_name"], None
                        )
                        if isinstance(target_widget, SegmentedButtonGroup):
                            # If an "enable_all_options" action exists, it implies this widget should be fully enabled
                            # unless a rule specifically constrains it. So, ensure all buttons are enabled by default.
                            # This is particularly for the `else_actions` of a `force_selection`.
                            if (
                                action_detail["action"] == "enable_all_options"
                            ):  # A bit of a heuristic
                                for button in target_widget.buttons:
                                    button.setEnabled(True)
                            # A more direct pre-reset for all targeted SegmentedButtonGroups could also be done here.

        # --- Pass 2: Evaluate conditions and apply actions ---
        for rule_config in Home.UI_RESTRICTIONS:
            condition_cfg = rule_config["condition"]
            condition_widget = getattr(self, condition_cfg["widget_name"], None)

            if not condition_widget:
                logger.warning(
                    f"Condition widget '{condition_cfg['widget_name']}' not found for a UI rule."
                )
                continue

            current_value = None
            if condition_cfg["property"] == "currentText" and hasattr(
                condition_widget, "currentText"
            ):
                current_value = condition_widget.currentText()
            elif condition_cfg["property"] == "isChecked" and hasattr(
                condition_widget, "isChecked"
            ):
                current_value = condition_widget.isChecked()
            # Add more property types if needed
            else:
                logger.warning(
                    f"Property '{condition_cfg['property']}' not supported for widget '{condition_cfg['widget_name']}'."
                )
                continue

            condition_met = current_value == condition_cfg["value"]

            actions_to_apply = (
                rule_config["then_actions"]
                if condition_met
                else rule_config.get("else_actions", [])
            )

            for action_detail in actions_to_apply:
                target_widget = getattr(self, action_detail["target_widget_name"], None)
                if not target_widget:
                    logger.warning(
                        f"Target widget '{action_detail['target_widget_name']}' not found for action."
                    )
                    continue

                action_type = action_detail["action"]

                if isinstance(target_widget, SegmentedButtonGroup):
                    if action_type == "force_selection":
                        value_to_set = action_detail["value"]
                        for button in target_widget.buttons:
                            button.setEnabled(button.text() == value_to_set)
                        target_widget.setCurrentText(value_to_set)
                    elif action_type == "disable_options":
                        options_to_disable = action_detail.get("options", [])
                        for button in target_widget.buttons:
                            if button.text() in options_to_disable:
                                button.setEnabled(False)
                    elif action_type == "enable_all_options":
                        for button in target_widget.buttons:
                            button.setEnabled(True)
                        target_widget.setEnabled(
                            True
                        )  # Ensure the group widget itself is enabled

                elif isinstance(target_widget, QWidget):  # General QWidget actions
                    if action_type == "set_visibility_and_space":
                        is_visible = action_detail["visible"]
                        set_widget_hidden_but_take_space(target_widget, not is_visible)
                    elif action_type == "set_enabled":
                        is_enabled = action_detail["enabled"]
                        if (
                            action_detail["target_widget_name"]
                            == "speech_recognition_button"
                        ):
                            # Assuming rule_config is available in this scope from the outer loop
                            rule_condition_info = rule_config.get("condition", {})
                            logger.debug(
                                f"[DEBUG SRB] Rule condition: {rule_condition_info}. Applying set_enabled: {is_enabled} to speech_recognition_button. Condition met for this rule: {condition_met}"
                            )
                        target_widget.setEnabled(is_enabled)

                # Add more widget types and actions as needed
                else:
                    logger.warning(
                        f"Action '{action_type}' on target '{action_detail['target_widget_name']}' is for an unhandled widget type: {type(target_widget)}."
                    )

        # Unblock signals
        for widget_name in widgets_to_manage_signals:
            widget = getattr(self, widget_name, None)
            if widget and hasattr(widget, "blockSignals"):
                widget.blockSignals(False)

        # Manually trigger update of dependent UI components that were programmatically changed.
        if "llm_source" in widgets_to_manage_signals:
            self._update_llm_provider_fields()
        # If other widgets affected by restrictions have their own update_..._fields methods,
        # they should be called here too, if their names are in widgets_to_manage_signals.

    def _handle_llm_source_change(self):
        """Handle changes in LLM source selection."""
        self._apply_ui_restrictions()  # Apply UI restrictions (will show/hide correct model container)
        # _sync_active_llm_model_value() will be called by _apply_ui_restrictions
        self.save_settings()  # Save settings as llm_source changed

    def _sync_active_llm_model_value(self):
        """Sync the currently selected LLM model value based on the active LLM source and loaded settings."""
        # Block signals from model widgets during programmatic update
        self.llm_model_edit.blockSignals(True)
        self.openai_model.blockSignals(True)
        self.groq_model.blockSignals(True)
        self.gemini_model.blockSignals(True)

        try:
            config = self.app_manager.load_settings()  # Get fresh complete settings
            llm_source = self.llm_source.currentText()

            # Default values from ApplicationManager for consistency (or use hardcoded if preferred)
            # These defaults are typically for initial setup if no specific model is found in settings.
            default_openai_model = config.get("OpenAI", {}).get("model", "gpt-4.1")
            default_gemini_model = config.get("Gemini", {}).get(
                "model", "gemini-2.0-flash"
            )
            default_groq_model = config.get("Groq", {}).get(
                "model", "llama-3.3-70b-versatile"
            )
            default_ollama_model = config.get("Ollama", {}).get(
                "model", "llama3.2:latest"
            )

            # Get the actual model stored for the current source under LLM/model if available,
            # otherwise use the provider-specific model, then the ultimate default.
            llm_config_model = config.get("LLM", {}).get("model")

            # Helper to check if a SegmentedButtonGroup contains a button with specific text
            def has_button_with_text(segmented_button_group, text_to_find):
                if not text_to_find:
                    return False  # Cannot find an empty string button typically
                for button in segmented_button_group.buttons:
                    if button.text() == text_to_find:
                        return True
                return False

            # Set model based on source - Visibility is handled by _apply_ui_restrictions
            if llm_source == "openai_api":
                openai_specific_model = config.get("OpenAI", {}).get(
                    "user_command_model", default_openai_model
                )
                # Prioritize LLM/model if it's valid for this provider, then provider-specific, then default
                model_to_set = (
                    llm_config_model
                    if has_button_with_text(self.openai_model, llm_config_model)
                    else openai_specific_model
                )
                self.openai_model.setCurrentText(model_to_set)
            elif llm_source == "gemini_api":
                gemini_specific_model = config.get("Gemini", {}).get(
                    "user_command_model", default_gemini_model
                )
                model_to_set = (
                    llm_config_model
                    if has_button_with_text(self.gemini_model, llm_config_model)
                    else gemini_specific_model
                )
                self.gemini_model.setCurrentText(model_to_set)
            elif llm_source == "groq_api":
                groq_specific_model = config.get("Groq", {}).get(
                    "user_command_model", default_groq_model
                )
                model_to_set = (
                    llm_config_model
                    if has_button_with_text(self.groq_model, llm_config_model)
                    else groq_specific_model
                )
                self.groq_model.setCurrentText(model_to_set)
            elif (
                llm_source == "ollama"
            ):  # Check if this is the exact text from SegmentedButtonGroup
                self.llm_model_edit.setText(
                    llm_config_model if llm_config_model else default_ollama_model
                )

        finally:
            # Unblock signals
            self.llm_model_edit.blockSignals(False)
            self.openai_model.blockSignals(False)
            self.groq_model.blockSignals(False)
            self.gemini_model.blockSignals(False)

    def poll_pressed_keys(self):
        """Poll for pressed keys and handle hotkey recording"""
        if (
            not self.is_recording_hotkey
            or self.stacked_widget.currentWidget() != self.keyboard_page
            or not self.isActiveWindow()
        ):
            return

        pressed_keys = self.app_manager.keyboard_manager.get_pressed_keys()
        key_symbols = [
            self.app_manager.keyboard_manager.get_key_symbol(k) for k in pressed_keys
        ]

        if len(key_symbols) > 0:
            if self._last_pressed_keys != key_symbols:
                self._last_pressed_keys = key_symbols
                self.recording_qline_edit.setText("+".join(key_symbols))
        else:
            # If no keys are pressed and we haven't locked in a combination
            if not self.recording_qline_edit.text():
                self._last_pressed_keys = None
                self.recording_qline_edit.setText("")

    def start_hotkey_recording(self, start_button, stop_button, q_line_edit):
        self.recording_qline_edit = q_line_edit
        start_button.setVisible(False)
        stop_button.setVisible(True)
        self.is_recording_hotkey = True
        self._last_pressed_keys = None
        self.keyboard_poll_timer.start(50)

    def stop_hotkey_recording(self, start_button, stop_button, q_line_edit):
        logger.info("Stopping hotkey recording")
        self.is_recording_hotkey = False
        self.keyboard_poll_timer.stop()
        start_button.setEnabled(True)

        if self._last_pressed_keys:
            hotkey_str = "+".join(self._last_pressed_keys)
            q_line_edit.setText(hotkey_str)
            q_line_edit.setPlaceholderText("Press any other key to change")
            # self.save_settings()  # Save the new hotkey setting

        start_button.setVisible(True)
        stop_button.setVisible(False)


def set_widget_hidden_but_take_space(widget: QWidget, hidden: bool):
    if hidden:
        opacity_effect = QGraphicsOpacityEffect()
        opacity_effect.setOpacity(0.0)
        widget.setGraphicsEffect(opacity_effect)
        widget.setDisabled(True)
        widget.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
    else:
        widget.setGraphicsEffect(None)
        widget.setDisabled(False)
        widget.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, False)

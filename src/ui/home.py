import datetime
import logging
import os
import shutil
import sys
import traceback

from PySide6.QtCore import QPointF, QSettings, Qt, QTimer
from PySide6.QtSvgWidgets import QSvgWidget
from PySide6.QtWidgets import (
    QFileDialog,
    QFormLayout,
    QFrame,
    QGraphicsOpacityEffect,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSpacerItem,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from src.application_manager import ApplicationManager
from src.keyboard.keyboard_manager import KeyboardManager
from src.ui.components.ito_layout import ItoLayout
from src.ui.components.menu_button import MenuButton
from src.ui.components.segmented_button_group import SegmentedButtonGroup
from src.ui.onboarding import OnboardingWindow
from src.ui.settings.language_model_page import LanguageModelPage
from src.ui.settings.speech_recognition_page import SpeechRecognitionPage
from src.ui.theme.manager import ThemeManager
from src.utils.logging import clear_log_file_contents, get_log_file_path
from src.utils.timing import clear_timing_data, save_timing_report

logger = logging.getLogger(__name__)


class Home(QMainWindow):
    UI_RESTRICTIONS = [
        {
            "condition": {
                "widget_name": "application_mode_selector",
                "property": "currentText",
                "value": "oneshot (gemini)",
            },
            "then_actions": [
                {
                    "target_widget_name": "llm_source",
                    "action": "force_selection",
                    "value": "gemini_api",
                },
                {
                    "target_widget_name": "speech_recognition_button",
                    "action": "set_enabled",
                    "enabled": False,
                },
            ],
            "else_actions": [
                {"target_widget_name": "llm_source", "action": "enable_all_options"}
            ],
        },
    ]

    def __init__(self, theme_manager: ThemeManager):
        super().__init__()
        self.theme_manager = theme_manager
        self.theme_manager.theme_changed.connect(self.update_styles)
        self.keyboard_manager = KeyboardManager.instance()
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setWindowTitle("")
        self.setMinimumWidth(900)
        self.setMinimumHeight(600)
        if sys.platform == "darwin":
            try:
                from ctypes import c_void_p

                import objc

                win = self.winId()
                ns_view = objc.objc_object(c_void_p(int(win)))
                ns_window = ns_view.window()
                if ns_window:
                    ns_window.setMovableByWindowBackground_(True)
            except Exception as e:
                logger.warning(f"Failed to enable native window dragging: {e}")
        self.save_settings_timer = QTimer()
        self.save_settings_timer.setSingleShot(True)
        self.save_settings_timer.timeout.connect(self._save_settings_impl)
        self.initial_load_complete = False
        self.app_manager = ApplicationManager.instance()
        self.app_manager.error_occurred.connect(self.handle_error)
        self.app_manager.status_changed.connect(self.handle_status_change)
        self.app_manager.settings_changed.connect(self.load_settings)
        if hasattr(self.app_manager, "status_window"):
            self.app_manager.status_window.show()
        self._dragging = False
        self._drag_start_position = QPointF()
        main_widget = ItoLayout(
            self, radius=8, show_close_button=True, theme_manager=self.theme_manager
        )
        main_widget.setObjectName("main_widget")
        self.setCentralWidget(main_widget)
        main_layout = QHBoxLayout()
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)
        main_widget.layout.addLayout(main_layout)
        main_widget.layout.setContentsMargins(0, 0, 0, 0)
        main_widget.layout.setSpacing(20)
        menu_panel = QWidget()
        menu_panel.setObjectName("menu_panel")
        menu_panel.setFixedWidth(200)
        menu_layout = QVBoxLayout(menu_panel)
        menu_layout.setContentsMargins(0, 0, 0, 0)
        menu_layout.setSpacing(0)
        menu_panel.setStyleSheet("background-color: transparent;")
        logo_container = QWidget()
        logo_container.setFixedHeight(64)
        logo_layout = QHBoxLayout(logo_container)
        logo_layout.setContentsMargins(0, 0, 0, 0)
        center_container = QWidget()
        center_layout = QHBoxLayout(center_container)
        center_layout.setContentsMargins(0, 0, 0, 0)
        center_layout.setSpacing(8)
        self.logo_label = QSvgWidget()
        self.logo_label.setFixedSize(32, 32)
        logo_fill = "white" if self.theme_manager.current_theme == "dark" else "black"
        logo_svg = self.theme_manager.get_logo_svg_content(logo_fill)
        if logo_svg:
            self.logo_label.load(bytearray(logo_svg, encoding="utf-8"))
        else:
            fallback_label = QLabel("🎯")
            center_layout.addWidget(fallback_label)
            self.logo_label = fallback_label
        center_layout.addWidget(self.logo_label)
        self.app_name = QLabel("ito")
        self.app_name.setStyleSheet(
            f"font-size: 24px; font-weight: 600; color: {self.theme_manager.get_color('text_primary')}; margin-top: 4px;"
        )
        center_layout.addWidget(self.app_name)
        logo_layout.addWidget(center_container, alignment=Qt.AlignmentFlag.AlignCenter)
        menu_layout.addWidget(logo_container)
        menu_layout.addSpacerItem(QSpacerItem(20, 20))
        self.speech_recognition_button = MenuButton(
            "Speech Recognition", 0, theme_manager=self.theme_manager
        )
        self.speech_recognition_button.setChecked(True)
        self.speech_recognition_button.clicked.connect(lambda: self.select_menu(0))
        menu_layout.addWidget(self.speech_recognition_button)
        self.language_model_button = MenuButton(
            "Language Model", 1, theme_manager=self.theme_manager
        )
        self.language_model_button.clicked.connect(lambda: self.select_menu(1))
        menu_layout.addWidget(self.language_model_button)
        self.api_keys_button = MenuButton(
            "API Keys", 2, theme_manager=self.theme_manager
        )
        self.api_keys_button.clicked.connect(lambda: self.select_menu(2))
        menu_layout.addWidget(self.api_keys_button)
        self.mode_button = MenuButton("Mode", 3, theme_manager=self.theme_manager)
        self.mode_button.clicked.connect(lambda: self.select_menu(3))
        menu_layout.addWidget(self.mode_button)
        self.audio_button = MenuButton("Audio", 4, theme_manager=self.theme_manager)
        self.audio_button.clicked.connect(lambda: self.select_menu(4))
        menu_layout.addWidget(self.audio_button)
        self.keyboard_button = MenuButton(
            "Keyboard", 5, theme_manager=self.theme_manager
        )
        self.keyboard_button.clicked.connect(lambda: self.select_menu(5))
        menu_layout.addWidget(self.keyboard_button)
        self.developer_button = MenuButton(
            "Developer", 6, theme_manager=self.theme_manager
        )
        self.developer_button.clicked.connect(lambda: self.select_menu(6))
        menu_layout.addWidget(self.developer_button)
        menu_layout.addStretch()
        content_widget = QWidget()
        content_widget.setObjectName("content_widget")
        content_layout = QVBoxLayout(content_widget)
        content_layout.setContentsMargins(36, 36, 8, 8)
        content_widget.setStyleSheet(
            f"background-color: {self.theme_manager.get_color('background')}; border-top-left-radius: 18px; border: none;"
        )
        self.stacked_widget = QStackedWidget()
        content_layout.addWidget(self.stacked_widget)
        self.stacked_widget.setStyleSheet("background-color: transparent;")

        self.style_callbacks = {
            "set_page_title_style": self.set_page_title_style,
            "set_label_style": self.set_label_style,
            "set_line_edit_style": self.set_line_edit_style,
            "set_widget_hidden_but_take_space": set_widget_hidden_but_take_space,
        }
        self.speech_recognition_page_widget = SpeechRecognitionPage(
            theme_manager=self.theme_manager,
            app_manager=self.app_manager,
            style_callbacks=self.style_callbacks,
        )
        self.stacked_widget.addWidget(self.speech_recognition_page_widget)
        self.language_model_page_widget = LanguageModelPage(
            theme_manager=self.theme_manager,
            app_manager=self.app_manager,
            style_callbacks=self.style_callbacks,
        )
        self.stacked_widget.addWidget(self.language_model_page_widget)

        self.api_keys_page = QWidget()
        api_keys_layout = QVBoxLayout(self.api_keys_page)
        api_keys_layout.setContentsMargins(0, 0, 0, 0)
        self.api_keys_title = QLabel("API Keys")
        self.set_page_title_style(self.api_keys_title)
        api_keys_layout.addWidget(
            self.api_keys_title, alignment=Qt.AlignmentFlag.AlignLeft
        )
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
        application_mode_label = QLabel("Application Mode:")
        self.set_label_style(application_mode_label)
        application_mode_container = QWidget()
        application_mode_layout = QVBoxLayout(application_mode_container)
        application_mode_layout.setContentsMargins(0, 0, 0, 0)
        application_mode_layout.setSpacing(4)
        application_mode_layout.addWidget(application_mode_label)
        self.application_mode_selector = SegmentedButtonGroup(
            ["discrete", "oneshot (gemini)"]
        )
        application_mode_layout.addWidget(self.application_mode_selector)
        mode_layout.addWidget(application_mode_container)
        mode_layout.addStretch()
        self.stacked_widget.addWidget(self.mode_page)

        self.audio_page = QWidget()
        audio_layout = QVBoxLayout(self.audio_page)
        audio_layout.setContentsMargins(0, 0, 0, 0)
        self.audio_title = QLabel("Audio")
        self.set_page_title_style(self.audio_title)
        audio_layout.addWidget(self.audio_title, alignment=Qt.AlignmentFlag.AlignLeft)
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

        menu_container = QWidget()
        menu_container_layout = QVBoxLayout(menu_container)
        menu_container_layout.setContentsMargins(0, 0, 0, 0)
        menu_container_layout.setSpacing(0)
        menu_container_layout.addWidget(menu_panel)
        main_layout.addWidget(menu_container)
        main_layout.addWidget(content_widget)
        self.setStyleSheet(
            self.styleSheet()
            + "QPushButton#btn-primary { background-color: #F6EBDD; color: #181A2A; border: none; border-radius: 14px; font-size: 16px; font-weight: 600; padding: 0 14px; min-height: 32px; min-width: 160px; letter-spacing: 0.2px; } QPushButton#btn-primary:hover { background-color: #f3e2c7; } QPushButton#btn-primary:disabled { background-color: #f3e2c7; color: #b0b0b0; }"
        )

        self.keyboard_page = QWidget()
        keyboard_layout = QVBoxLayout(self.keyboard_page)
        keyboard_layout.setContentsMargins(0, 0, 0, 0)
        self.keyboard_title = QLabel("Keyboard")
        self.set_page_title_style(self.keyboard_title)
        keyboard_layout.addWidget(
            self.keyboard_title, alignment=Qt.AlignmentFlag.AlignLeft
        )
        keyboard_form_layout = QFormLayout()
        keyboard_form_layout.setSpacing(16)
        keyboard_form_layout.setContentsMargins(0, 0, 0, 0)
        keyboard_form_layout.setLabelAlignment(
            Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter
        )
        keyboard_form_layout.setFormAlignment(
            Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter
        )
        self._hotkey_recording = None
        self.dictation_hotkey = QLineEdit()
        self.dictation_hotkey.setMaximumWidth(300)
        self.set_line_edit_style(self.dictation_hotkey)
        self.dictation_hotkey.setReadOnly(True)
        dictation_hotkey_label = QLabel("Dictation Hotkey")
        self.set_label_style(dictation_hotkey_label)
        dictation_hotkey_container = QWidget()
        dictation_hotkey_layout = QVBoxLayout(dictation_hotkey_container)
        dictation_hotkey_layout.setContentsMargins(0, 0, 0, 0)
        dictation_hotkey_layout.setSpacing(4)
        dictation_hotkey_layout.addWidget(dictation_hotkey_label)
        dictation_hotkey_layout.addWidget(self.dictation_hotkey)
        keyboard_form_layout.addRow(dictation_hotkey_container)
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
        self.action_hotkey.setReadOnly(True)
        action_hotkey_label = QLabel("Action Hotkey")
        self.set_label_style(action_hotkey_label)
        action_hotkey_container = QWidget()
        action_hotkey_layout = QVBoxLayout(action_hotkey_container)
        action_hotkey_layout.setContentsMargins(0, 0, 0, 0)
        action_hotkey_layout.setSpacing(4)
        action_hotkey_layout.addWidget(action_hotkey_label)
        action_hotkey_layout.addWidget(self.action_hotkey)
        keyboard_form_layout.addRow(action_hotkey_container)
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
        self._all_start_recording_buttons = [
            self.start_recording_dictation,
            self.start_recording_action,
        ]
        self._last_pressed_keys = None
        self.recording_qline_edit = self.dictation_hotkey
        self.keyboard_poll_timer = QTimer(self)
        self.keyboard_poll_timer.timeout.connect(self.poll_pressed_keys)
        keyboard_layout.addLayout(keyboard_form_layout)
        keyboard_layout.addStretch()
        self.stacked_widget.addWidget(self.keyboard_page)

        self.developer_page = QWidget()
        developer_layout = QVBoxLayout(self.developer_page)
        developer_layout.setContentsMargins(0, 0, 0, 0)
        self.developer_title = QLabel("Developer")
        self.set_page_title_style(self.developer_title)
        developer_layout.addWidget(
            self.developer_title, alignment=Qt.AlignmentFlag.AlignLeft
        )
        developer_form_layout = QFormLayout()
        developer_form_layout.setSpacing(16)
        developer_form_layout.setContentsMargins(0, 0, 0, 0)
        developer_form_layout.setLabelAlignment(
            Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter
        )
        developer_form_layout.setFormAlignment(
            Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter
        )
        dev_mode = os.getenv("DEV")
        if dev_mode:
            self.add_section_header(
                developer_form_layout,
                "Developer Timing Tools",
                color=self.theme_manager.get_color("text_primary"),
            )
            timing_buttons_widget = QWidget()
            timing_button_layout = QHBoxLayout(timing_buttons_widget)
            timing_button_layout.setContentsMargins(0, 0, 0, 0)
            timing_button_layout.setSpacing(10)
            self.save_timing_report_button = QPushButton("Save Timing Report")
            self.set_primary_button_style(self.save_timing_report_button)
            self.save_timing_report_button.clicked.connect(
                self.handle_save_timing_report
            )
            timing_button_layout.addWidget(self.save_timing_report_button)
            self.clear_timing_data_button = QPushButton("Clear Timing Data")
            self.set_primary_button_style(self.clear_timing_data_button)
            self.clear_timing_data_button.clicked.connect(self.handle_clear_timing_data)
            timing_button_layout.addWidget(self.clear_timing_data_button)
            timing_button_layout.addStretch()
            developer_form_layout.addRow(timing_buttons_widget)
        self.add_section_header(
            developer_form_layout,
            "Log Management Tools",
            color=self.theme_manager.get_color("text_primary"),
        )
        log_buttons_widget = QWidget()
        log_buttons_layout = QHBoxLayout(log_buttons_widget)
        log_buttons_layout.setContentsMargins(0, 0, 0, 0)
        log_buttons_layout.setSpacing(10)
        self.save_log_button = QPushButton("Save Log File")
        self.set_primary_button_style(self.save_log_button)
        self.save_log_button.clicked.connect(self.handle_save_log_file)
        log_buttons_layout.addWidget(self.save_log_button)
        self.clear_log_button = QPushButton("Clear Log File")
        self.set_primary_button_style(self.clear_log_button)
        self.clear_log_button.clicked.connect(self.handle_clear_log_file)
        log_buttons_layout.addWidget(self.clear_log_button)
        log_buttons_layout.addStretch()
        developer_form_layout.addRow(log_buttons_widget)
        self.add_section_header(
            developer_form_layout,
            "Reset Settings",
            color=self.theme_manager.get_color("text_primary"),
        )
        reset_button_widget = QWidget()
        reset_button_layout = QHBoxLayout(reset_button_widget)
        reset_button_layout.setContentsMargins(0, 0, 0, 0)
        reset_button_layout.setSpacing(10)
        reset_button = QPushButton("Reset All")
        self.set_primary_button_style(reset_button)
        reset_button.clicked.connect(self.reset_all_settings)
        reset_button_layout.addWidget(reset_button)
        reset_button_layout.addStretch()
        developer_form_layout.addRow(reset_button_widget)
        developer_layout.addLayout(developer_form_layout)
        developer_layout.addStretch()
        self.stacked_widget.addWidget(self.developer_page)

        self.openai_api_key_edit.textChanged.connect(self.save_settings)
        self.gemini_api_key_edit.textChanged.connect(self.save_settings)
        self.groq_api_key_edit.textChanged.connect(self.save_settings)
        self.speech_recognition_page_widget.settings_changed.connect(self.save_settings)
        self.language_model_page_widget.settings_changed.connect(
            self._handle_page_settings_changed
        )
        self.sample_rate.selectionChanged.connect(self.save_settings)
        self.channels.selectionChanged.connect(self.save_settings)
        self.application_mode_selector.selectionChanged.connect(self._handle_ui_change)
        QTimer.singleShot(100, self.load_settings)

        current_settings = self.app_manager.load_settings()
        if current_settings:
            is_valid, error_msg = self.app_manager.validate_settings(current_settings)
            if is_valid:
                self.app_manager.start_application()
            else:
                self.handle_error(error_msg)

    def _get_page_widget(self, name: str) -> QWidget | None:
        if hasattr(self, name):
            return getattr(self, name)
        if hasattr(self, "speech_recognition_page_widget") and hasattr(
            self.speech_recognition_page_widget, name
        ):
            return getattr(self.speech_recognition_page_widget, name)
        if hasattr(self, "language_model_page_widget") and hasattr(
            self.language_model_page_widget, name
        ):
            return getattr(self.language_model_page_widget, name)
        return None

    def update_styles(self, new_theme):
        logo_fill = "white" if self.theme_manager.current_theme == "dark" else "black"
        logo_svg = self.theme_manager.get_logo_svg_content(logo_fill)
        if logo_svg and isinstance(self.logo_label, QSvgWidget):
            self.logo_label.load(bytearray(logo_svg, encoding="utf-8"))
        elif isinstance(self.logo_label, QLabel):
            self.logo_label.setText("🎯")
        self.app_name.setStyleSheet(
            f"font-size: 24px; font-weight: 600; color: {self.theme_manager.get_color('text_primary')}; margin-top: 4px;"
        )

        if hasattr(self, "speech_recognition_page_widget"):
            self.speech_recognition_page_widget.update_styles()
        if hasattr(self, "language_model_page_widget"):
            self.language_model_page_widget.update_styles()

        page_titles_in_home = [
            getattr(self, "api_keys_title", None),
            getattr(self, "mode_title", None),
            getattr(self, "audio_title", None),
            getattr(self, "keyboard_title", None),
            getattr(self, "developer_title", None),
        ]
        for label in page_titles_in_home:
            if label:
                self.set_page_title_style(label)

        if hasattr(self, "_themed_labels"):
            for label in list(self._themed_labels):
                is_home_direct_label = False
                parent = label.parentWidget()
                while parent is not None:
                    if parent in [
                        self.api_keys_page,
                        self.mode_page,
                        self.audio_page,
                        self.keyboard_page,
                        self.developer_page,
                    ]:
                        is_home_direct_label = True
                        break
                    if isinstance(parent, QFormLayout) and parent.parentWidget() in [
                        self.api_keys_page,
                        self.mode_page,
                        self.audio_page,
                        self.keyboard_page,
                        self.developer_page,
                    ]:
                        is_home_direct_label = True
                        break
                    parent = parent.parentWidget()
                if is_home_direct_label:
                    self.set_label_style(label)

        dev_page_buttons = []
        if hasattr(self, "save_timing_report_button"):
            dev_page_buttons.append(self.save_timing_report_button)
        if hasattr(self, "clear_timing_data_button"):
            dev_page_buttons.append(self.clear_timing_data_button)
        if hasattr(self, "save_log_button"):
            dev_page_buttons.append(self.save_log_button)
        if hasattr(self, "clear_log_button"):
            dev_page_buttons.append(self.clear_log_button)
        for button in dev_page_buttons:
            if button:
                self.set_primary_button_style(button)
        if hasattr(self, "developer_page"):
            for widget in self.developer_page.findChildren(QPushButton):
                if widget.text() == "Reset All":
                    self.set_primary_button_style(widget)

        if hasattr(self, "developer_page") and hasattr(self, "keyboard_page"):
            for page_widget_container in [self.developer_page, self.keyboard_page]:
                if page_widget_container:
                    for child_widget in page_widget_container.findChildren(QLabel):
                        if child_widget.text() in [
                            "Developer Timing Tools",
                            "Log Management Tools",
                            "Reset Settings",
                            "Output Settings",
                            "Hotkey Settings",
                        ]:
                            self.set_label_style(
                                child_widget,
                                color=self.theme_manager.get_color("text_primary"),
                                font_size=15,
                                font_weight=600,
                            )

    def select_menu(self, index):
        if (
            hasattr(self, "keyboard_page")
            and self.stacked_widget.currentWidget() == self.keyboard_page
        ):
            if hasattr(self, "is_recording_hotkey"):
                self.is_recording_hotkey = False
            self._last_pressed_keys = None
        self.stacked_widget.setCurrentIndex(index)
        self.speech_recognition_button.setChecked(index == 0)
        self.language_model_button.setChecked(index == 1)
        self.api_keys_button.setChecked(index == 2)
        self.mode_button.setChecked(index == 3)
        self.audio_button.setChecked(index == 4)
        self.keyboard_button.setChecked(index == 5)
        self.developer_button.setChecked(index == 6)

    def handle_save_timing_report(self):
        try:
            save_timing_report()
            QMessageBox.information(
                self, "Timing Report", "Timing report saved successfully."
            )
        except Exception as e:
            QMessageBox.critical(
                self, "Timing Report Error", f"Failed to save: {str(e)}"
            )
            logger.error(f"Error saving timing report: {traceback.format_exc()}")

    def handle_clear_timing_data(self):
        try:
            clear_timing_data()
            QMessageBox.information(
                self, "Timing Data", "Timing data cleared successfully."
            )
        except Exception as e:
            QMessageBox.critical(
                self, "Timing Data Error", f"Failed to clear: {str(e)}"
            )
            logger.error(f"Error clearing timing data: {traceback.format_exc()}")

    def handle_save_log_file(self):
        source_log_path = get_log_file_path()
        if not source_log_path or not os.path.exists(source_log_path):
            QMessageBox.warning(
                self, "Save Log Error", f"Log file not found: {source_log_path}"
            )
            return
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        suggested_filename = f"ito_log_{timestamp}.log"
        default_dir = os.path.expanduser("~/Downloads")
        if not os.path.isdir(default_dir):
            default_dir = os.path.expanduser("~")
        destination_path, _ = QFileDialog.getSaveFileName(
            self,
            "Save Log File As",
            os.path.join(default_dir, suggested_filename),
            "Log files (*.log);;All files (*.*)",
        )
        if destination_path:
            try:
                shutil.copy2(source_log_path, destination_path)
            except Exception as e:
                QMessageBox.critical(
                    self, "Save Log Error", f"Failed to save: {str(e)}"
                )
                logger.error(
                    f"Error saving log to {destination_path}: {traceback.format_exc()}"
                )

    def handle_clear_log_file(self):
        try:
            if clear_log_file_contents():
                QMessageBox.information(
                    self, "Log Cleared", "Log file cleared successfully."
                )
            else:
                QMessageBox.critical(
                    self, "Clear Log Error", "Failed to clear log file."
                )
        except Exception as e:
            QMessageBox.critical(
                self, "Clear Log Error", f"An unexpected error: {str(e)}"
            )
            logger.error(f"Unexpected error: {traceback.format_exc()}")

    def reset_all_settings(self):
        self.app_manager.stop_application()
        settings = QSettings(
            OnboardingWindow.ORGANIZATION_NAME, OnboardingWindow.APPLICATION_NAME
        )
        settings.clear()
        settings.sync()
        self.onboarding_window = OnboardingWindow(theme_manager=self.theme_manager)
        self.onboarding_window.show()
        self.hide()

    def add_section_header(self, layout, text, color=None):
        if layout.rowCount() > 0:
            divider = QFrame()
            divider.setFrameShape(QFrame.Shape.HLine)
            divider.setFixedHeight(1)
            divider.setStyleSheet(
                f"background: rgba(242, 228, 214, 0.3); border: none; margin-top: 16px; margin-bottom: 16px; color: {color or self.theme_manager.get_color('text_primary')};"
            )
            layout.addRow(divider)
        header = QLabel(text)
        header.setStyleSheet(
            f"font-size: 15px; font-weight: 600; color: {color or self.theme_manager.get_color('text_primary')}; margin-top: 24px; margin-bottom: 8px; font-family: 'Inter 18pt', -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif;"
        )
        layout.addRow(header)

    def handle_error(self, error_msg: str) -> None:
        if "Failed to start application" in error_msg:
            QMessageBox.critical(
                self, "Application Error", f"Failed to start application:\n{error_msg}"
            )

    def handle_status_change(self, status: str) -> None:
        pass

    def _handle_page_settings_changed(self):
        logger.debug(
            "Home: Page settings changed, applying UI restrictions and debouncing save."
        )
        self._apply_ui_restrictions()
        self.save_settings()

    def save_settings(self):
        if self.initial_load_complete:
            self.save_settings_timer.start(2500)

    def _save_settings_impl(self):
        logger.info("[Saving Settings] Starting save process in Home")
        try:
            asr_page_settings = self.speech_recognition_page_widget.get_settings()
            llm_page_settings = self.language_model_page_widget.get_settings()
            logger.info(f"ASR page settings: {asr_page_settings}")
            logger.info(f"LLM page settings: {llm_page_settings}")
            selected_application_mode = self.application_mode_selector.currentText()
            if selected_application_mode == "oneshot (gemini)":
                selected_application_mode = "oneshot"

            new_settings = {
                "APIKeys": {
                    "openai_api_key": self.openai_api_key_edit.text(),
                    "groq_api_key": self.groq_api_key_edit.text(),
                    "gemini_api_key": self.gemini_api_key_edit.text(),
                },
                "OpenAI": {
                    "user_command_model": llm_page_settings[
                        "openai_user_command_model"
                    ],
                    "asr_model": asr_page_settings["openai_selected_asr_model"],
                },
                "Gemini": {
                    "user_command_model": llm_page_settings[
                        "gemini_user_command_model"
                    ],
                    "asr_model": asr_page_settings["gemini_selected_asr_model"],
                },
                "Ollama": {"model": llm_page_settings["ollama_model"]},
                "Groq": {
                    "user_command_model": llm_page_settings["groq_user_command_model"],
                    "asr_model": asr_page_settings["groq_selected_asr_model"],
                },
                "ASR": {
                    "source": asr_page_settings["source"],
                    "model": asr_page_settings["model"],
                    "local_model_size": asr_page_settings["local_model_size"],
                    "compute_type": asr_page_settings["compute_type"],
                },
                "LLM": {
                    "source": llm_page_settings["source"],
                    "model": llm_page_settings["model"],
                    "max_tokens": llm_page_settings["max_tokens"],
                    "temperature": llm_page_settings["temperature"],
                },
                "Audio": {
                    "sample_rate": int(self.sample_rate.currentText()),
                    "channels": int(self.channels.currentText()),
                },
                "Hotkeys": {
                    "action_hotkey": self.action_hotkey.text(),
                    "dictation_hotkey": self.dictation_hotkey.text(),
                },
                "Mode": {"application_mode": selected_application_mode},
            }
            is_valid, error_msg = self.app_manager.validate_settings(new_settings)
            if not is_valid:
                logger.error(f"Settings are not valid: {error_msg}")
                self.handle_error(error_msg)
                return
            self.app_manager.save_settings(new_settings)
            logger.info("Home: Settings saved successfully via _save_settings_impl.")
        except Exception as e:
            logger.error(
                f"[Saving Settings in Home] Error: {str(e)} \n {traceback.format_exc()}"
            )
            self.handle_error(f"Failed to save settings: {str(e)}")

    def load_settings(self):
        logger.debug("Home: Loading settings...")
        try:
            config = self.app_manager.load_settings()
            api_keys_config = config.get("APIKeys", {})
            self.openai_api_key_edit.setText(api_keys_config.get("openai_api_key", ""))
            self.gemini_api_key_edit.setText(api_keys_config.get("gemini_api_key", ""))
            self.groq_api_key_edit.setText(api_keys_config.get("groq_api_key", ""))

            if hasattr(self, "speech_recognition_page_widget"):
                self.speech_recognition_page_widget.load_settings(
                    config.get("ASR", {}),
                    config.get("OpenAI", {}),
                    config.get("Gemini", {}),
                    config.get("Groq", {}),
                )
            if hasattr(self, "language_model_page_widget"):
                self.language_model_page_widget.load_settings(
                    config.get("LLM", {}),
                    config.get("Ollama", {}),
                    config.get("OpenAI", {}),
                    config.get("Gemini", {}),
                    config.get("Groq", {}),
                )

            audio_conf = config.get("Audio", {})
            self.sample_rate.setCurrentText(str(audio_conf.get("sample_rate", "16000")))
            self.channels.setCurrentText(str(audio_conf.get("channels", "1")))
            hotkeys_conf = config.get("Hotkeys", {})
            self.dictation_hotkey.setText(hotkeys_conf.get("dictation_hotkey", ""))
            self.action_hotkey.setText(hotkeys_conf.get("action_hotkey", ""))
            mode_config = config.get("Mode", {})
            stored_mode = mode_config.get("application_mode", "discrete")
            if stored_mode == "oneshot":
                stored_mode = "oneshot (gemini)"

            self.application_mode_selector.blockSignals(True)
            self.application_mode_selector.setCurrentText(stored_mode)
            self.application_mode_selector.blockSignals(False)

            self._apply_ui_restrictions()
            self.initial_load_complete = True
            logger.debug("Home: Settings loaded and initial_load_complete=True.")
        except Exception as e:
            logger.error(
                f"Error in Home.load_settings: {str(e)}\n{traceback.format_exc()}"
            )
            self.handle_error(f"Failed to load settings: {str(e)}")

    def closeEvent(self, event):
        logger.info("Closing Home window")
        self.keyboard_manager.cleanup()
        self.app_manager.closeEvent(event)
        if hasattr(self.app_manager, "status_window"):
            self.app_manager.status_window.hide()
        super().closeEvent(event)

    def set_page_title_style(self, label):
        label.setStyleSheet(
            f"font-size: 24px; font-weight: 600; color: {self.theme_manager.get_color('text_primary')}; margin-bottom: 28px; margin-left: 0px;"
        )

    def set_line_edit_style(self, line_edit):
        line_edit.setStyleSheet(
            "QLineEdit { background-color: rgba(255, 255, 255, 0.15); padding: 8px 12px; border-radius: 8px; }"
        )

    def set_label_style(
        self, label, *, color=None, font_size=13, padding="8px 0px", font_weight=None
    ):
        if not hasattr(self, "_themed_labels"):
            self._themed_labels = []
        is_home_direct_label = False
        parent = label.parentWidget()
        while parent is not None:
            if parent in [
                self.api_keys_page,
                self.mode_page,
                self.audio_page,
                self.keyboard_page,
                self.developer_page,
            ]:
                is_home_direct_label = True
                break
            if isinstance(parent, QFormLayout) and parent.parentWidget() in [
                self.api_keys_page,
                self.mode_page,
                self.audio_page,
                self.keyboard_page,
                self.developer_page,
            ]:
                is_home_direct_label = True
                break
            parent = parent.parentWidget()
        if is_home_direct_label and label not in self._themed_labels:
            self._themed_labels.append(label)
        label_color = color or self.theme_manager.get_color("text_primary")
        weight = f"font-weight: {font_weight};" if font_weight else ""
        label.setStyleSheet(
            f"font-size: {font_size}px; color: {label_color}; padding: {padding}; {weight}"
        )

    def set_primary_button_style(self, button):
        background = self.theme_manager.get_color("button.background")
        text_color = self.theme_manager.get_color("button.text")
        button.setStyleSheet(
            f"QPushButton {{ background-color: {background}; color: {text_color}; border: none; border-radius: 8px; font-size: 12px; font-weight: 600; padding: 0 14px; min-height: 44px; min-width: 160px; letter-spacing: 0.2px; }} QPushButton:hover {{ background-color: {background}; opacity: 0.9; }}"
        )

    def _handle_ui_change(self):
        logger.debug("Home: UI element changed, applying restrictions and saving.")
        self._apply_ui_restrictions()
        self.save_settings()

    def _apply_ui_restrictions(self):
        logger.debug("Home: Applying UI restrictions...")
        widgets_to_block_signals = set()
        if hasattr(self, "language_model_page_widget"):
            llm_source_widget = self.language_model_page_widget.llm_source
            if llm_source_widget:
                widgets_to_block_signals.add(llm_source_widget)

        for widget_obj in widgets_to_block_signals:
            widget_obj.blockSignals(True)
        logger.debug(
            f"Home: Signals blocked for {len(widgets_to_block_signals)} widgets: {widgets_to_block_signals}"
        )

        self.speech_recognition_button.setEnabled(True)

        for rule_config in Home.UI_RESTRICTIONS:
            for action_list_key in ["then_actions", "else_actions"]:
                if action_list_key in rule_config:
                    for action_detail in rule_config[action_list_key]:
                        target_widget_instance = self._get_page_widget(
                            action_detail["target_widget_name"]
                        )
                        if (
                            isinstance(target_widget_instance, SegmentedButtonGroup)
                            and action_detail["action"] == "enable_all_options"
                        ):
                            for button in target_widget_instance.buttons:
                                button.setEnabled(True)
                            target_widget_instance.setEnabled(True)

        for rule_config in Home.UI_RESTRICTIONS:
            condition_cfg = rule_config["condition"]
            condition_widget_instance = self._get_page_widget(
                condition_cfg["widget_name"]
            )
            if not condition_widget_instance:
                logger.warning(
                    f"UI Rule Cond: Widget '{condition_cfg['widget_name']}' not found."
                )
                continue

            current_value = None
            if condition_cfg["property"] == "currentText":
                current_value = condition_widget_instance.currentText()
            elif condition_cfg["property"] == "isChecked":
                current_value = condition_widget_instance.isChecked()
            else:
                logger.warning(
                    f"UI Rule Cond: Property '{condition_cfg['property']}' not supported."
                )
                continue

            condition_met = current_value == condition_cfg["value"]
            actions_to_apply = (
                rule_config["then_actions"]
                if condition_met
                else rule_config.get("else_actions", [])
            )

            for action_detail in actions_to_apply:
                target_widget_instance = self._get_page_widget(
                    action_detail["target_widget_name"]
                )
                if not target_widget_instance:
                    logger.warning(
                        f"UI Rule Action: Target '{action_detail['target_widget_name']}' not found."
                    )
                    continue

                action_type = action_detail["action"]
                logger.debug(
                    f"Applying rule action: {action_type} to {action_detail['target_widget_name']}"
                )
                if isinstance(target_widget_instance, SegmentedButtonGroup):
                    if action_type == "force_selection":
                        value_to_set = action_detail["value"]
                        target_widget_instance.setCurrentText(value_to_set)
                        for button in target_widget_instance.buttons:
                            button.setEnabled(button.text() == value_to_set)
                elif isinstance(target_widget_instance, MenuButton):
                    if action_type == "set_enabled":
                        target_widget_instance.setEnabled(action_detail["enabled"])
                else:
                    logger.warning(
                        f"UI Rule Action: Unhandled widget type {type(target_widget_instance)} for '{action_detail['target_widget_name']}'."
                    )

        for widget_obj in widgets_to_block_signals:
            widget_obj.blockSignals(False)
            logger.debug(f"Home: Signals unblocked for {widget_obj}.")
            if widget_obj == self.language_model_page_widget.llm_source:
                logger.debug("Home: Manually syncing LLM page UI after rule change.")
                self.language_model_page_widget._update_ui_for_llm_source()

        logger.debug("Home: UI restrictions applied.")

    def poll_pressed_keys(self):
        if (
            not hasattr(self, "is_recording_hotkey")
            or not self.is_recording_hotkey
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
        elif not self.recording_qline_edit.text():
            self._last_pressed_keys = None
            self.recording_qline_edit.setText("")

    def start_hotkey_recording(self, start_button, stop_button, q_line_edit):
        self.keyboard_manager.pause_hotkey_triggers()
        self.recording_qline_edit = q_line_edit
        start_button.setVisible(False)
        stop_button.setVisible(True)
        self.is_recording_hotkey = True
        self._last_pressed_keys = None
        self.keyboard_poll_timer.start(50)
        for button in self._all_start_recording_buttons:
            if button != start_button:
                button.setEnabled(False)

    def stop_hotkey_recording(self, start_button, stop_button, q_line_edit):
        logger.info("Stopping hotkey recording")
        self.is_recording_hotkey = False
        self.keyboard_poll_timer.stop()
        start_button.setEnabled(True)
        if self._last_pressed_keys:
            hotkey_str = "+".join(self._last_pressed_keys)
            q_line_edit.setText(hotkey_str)
            self.save_settings()
        start_button.setVisible(True)
        stop_button.setVisible(False)
        for button in self._all_start_recording_buttons:
            button.setEnabled(True)
        self.keyboard_manager.resume_hotkey_triggers()


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

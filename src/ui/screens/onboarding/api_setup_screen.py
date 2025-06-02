from PySide6.QtCore import (
    QEasingCurve,
    QPoint,
    QPropertyAnimation,
    Qt,
    QTimer,
    QUrl,
    Signal,
)
from PySide6.QtGui import QCursor, QDesktopServices
from PySide6.QtWidgets import (
    QFrame,
    QGraphicsOpacityEffect,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)

from src.ui.theme.manager import ThemeManager


class ProviderSelectButton(QFrame):
    clicked = Signal(int)

    def __init__(self, name, desc, idx, theme_manager, parent=None):
        super().__init__(parent)
        self.idx = idx
        self.theme_manager = theme_manager
        self.setObjectName("provider_select_button")
        self.setCursor(Qt.PointingHandCursor)
        self.setFrameShape(QFrame.StyledPanel)
        self.setFrameShadow(QFrame.Raised)
        self.selected = False
        self.has_checkmark = False
        self._init_ui(name, desc)
        self.set_selected(False)

    def _init_ui(self, name, desc):
        self.outer_layout = QHBoxLayout(self)
        self.outer_layout.setContentsMargins(0, 0, 0, 0)
        self.outer_layout.setSpacing(0)

        # Left bar
        self.left_bar = QFrame()
        self.left_bar.setStyleSheet("background: transparent; border-radius: 2px;")
        self.outer_layout.addWidget(self.left_bar)

        # Texts
        text_container = QWidget()
        text_layout = QVBoxLayout(text_container)
        text_layout.setContentsMargins(12, 2, 12, 2)
        text_layout.setSpacing(0)
        self.name_label = QLabel(name)
        self.name_label.setStyleSheet(
            f"font-size: 15px; font-weight: 600; color: {self.theme_manager.get_color('text_primary')};"
        )
        self.desc_label = QLabel(desc)
        self.desc_label.setStyleSheet(
            f"font-size: 13px; color: {self.theme_manager.get_color('text_secondary')}; font-weight: 400;"
        )
        text_layout.addWidget(self.name_label)
        text_layout.addWidget(self.desc_label)
        self.outer_layout.addWidget(text_container, stretch=1)

        # Checkmark
        self.checkmark_label = QLabel()
        self.checkmark_label.setFixedSize(20, 20)
        self.checkmark_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.checkmark_label.setStyleSheet("background: transparent;")
        self.checkmark_label.hide()
        self.outer_layout.addWidget(self.checkmark_label)
        self.setFixedHeight(44)

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.clicked.emit(self.idx)
        super().mousePressEvent(event)

    def set_selected(self, selected):
        self.selected = selected
        if selected:
            bar_color = self.theme_manager.get_color("primary")
        else:
            bar_color = "transparent"
        self.left_bar.setStyleSheet(f"background: {bar_color}; border-radius: 2px;")
        font_color = (
            self.theme_manager.get_color("primary")
            if selected
            else self.theme_manager.get_color("text_primary")
        )
        self.name_label.setStyleSheet(
            f"font-size: 15px; font-weight: 600; color: {font_color};"
        )
        # Remove border
        self.setStyleSheet(
            "QFrame#provider_select_button { border: none; background: transparent; }"
        )

    def set_checkmark(self, show):
        self.has_checkmark = show
        if show:
            self.checkmark_label.setText("✓")
            self.checkmark_label.setStyleSheet(
                "background: #fff; border-radius: 10px; color: #222; font-size: 12px; font-weight: 700; border: none; padding: 0px;"
            )
            self.checkmark_label.show()
        else:
            self.checkmark_label.hide()


class KeyHelperButton(QWidget):
    def __init__(self, left_text, url, theme_manager, parent=None):
        super().__init__(parent)
        self.url = url
        self.theme_manager = theme_manager
        self.setCursor(QCursor(Qt.PointingHandCursor))
        layout = QHBoxLayout(self)
        layout.setContentsMargins(10, 0, 10, 0)
        layout.setSpacing(0)
        self.left_label = QLabel(left_text)
        self.left_label.setStyleSheet(
            f"font-size: 12px; color: {self.theme_manager.get_color('text_secondary')};"
        )
        layout.addWidget(self.left_label, alignment=Qt.AlignmentFlag.AlignLeft)
        layout.addStretch()
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        self.url_label = QLabel(f"{url} ↗")
        self.url_label.setStyleSheet(
            f"font-size: 12px; color: {self.theme_manager.get_color('text_secondary')};"
        )
        layout.addWidget(self.url_label, alignment=Qt.AlignmentFlag.AlignRight)
        self.mousePressEvent = self.open_url_event
        self.setStyleSheet("background: transparent; border: none;")

    def open_url_event(self, event):
        QDesktopServices.openUrl(QUrl(self.url))


class ApiSetupScreen:
    PROVIDERS = [
        {"name": "Groq", "desc": "Fastest"},
        {"name": "OpenAI", "desc": "Highest Quality"},
        {"name": "Gemini", "desc": "Balanced"},
        {"name": "Ollama", "desc": "Local"},
    ]

    def __init__(self, theme_manager: ThemeManager):
        self.theme_manager = theme_manager
        self.selected_api_type = "groq"  # Default to Groq
        self.api_key_input = None
        self.continue_button = None
        self.provider_buttons = []
        self.helper_widget = None
        self.right_title = None
        self.title = None
        self.subtitle = None
        self.selected_idx = 0
        self.provider_keys = {
            provider["name"].lower(): "" for provider in self.PROVIDERS
        }
        # Connect theme change signal
        self.theme_manager.theme_changed.connect(self.update_styles)

    def update_styles(self):
        """Update styles when theme changes"""
        if self.right_title:
            self.right_title.setStyleSheet(
                f"font-size: 20px; font-weight: 600; color: {self.theme_manager.get_color('text_primary')}; margin-bottom: 8px;"
            )

        # Update title and subtitle
        if self.title:
            self.title.setStyleSheet(
                f"""
                font-size: 28px;
                font-weight: 600;
                color: {self.theme_manager.get_color("text_primary")};
                margin-bottom: 12px;
                letter-spacing: -0.5px;
                """
            )

        if self.subtitle:
            self.subtitle.setText(
                f'<div style="line-height: 1.5; font-size: 15px; color: {self.theme_manager.get_color("text_secondary")}; font-weight: 400; letter-spacing: 0.1px;">Connect Inten to your preferred LLM by adding the API key</div>'
            )

        # Update provider buttons
        for btn in self.provider_buttons:
            if btn.selected:
                bar_color = self.theme_manager.get_color("primary")
                font_color = self.theme_manager.get_color("primary")
            else:
                bar_color = "transparent"
                font_color = self.theme_manager.get_color("text_primary")

            btn.left_bar.setStyleSheet(f"background: {bar_color}; border-radius: 2px;")
            btn.name_label.setStyleSheet(
                f"font-size: 15px; font-weight: 600; color: {font_color};"
            )
            btn.desc_label.setStyleSheet(
                f"font-size: 13px; color: {self.theme_manager.get_color('text_secondary')}; font-weight: 400;"
            )

        # Update helper widget if it exists
        if self.helper_widget:
            self.helper_widget.left_label.setStyleSheet(
                f"font-size: 12px; color: {self.theme_manager.get_color('text_secondary')};"
            )
            self.helper_widget.url_label.setStyleSheet(
                f"font-size: 12px; color: {self.theme_manager.get_color('text_secondary')};"
            )

    def create(self, parent_layout):
        # Main centering container
        outer_container = QWidget()
        outer_layout = QHBoxLayout(outer_container)
        outer_layout.setContentsMargins(0, 12, 0, 0)
        outer_layout.setSpacing(0)
        outer_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # Left: Provider menu (sidebar)
        left_widget = QWidget()
        left_widget.setFixedWidth(240)
        left_layout = QVBoxLayout(left_widget)
        left_layout.setSpacing(4)
        left_layout.setAlignment(Qt.AlignmentFlag.AlignTop)

        self.title = QLabel("API Key Setup")
        self.title.setStyleSheet(
            f"""
            font-size: 28px;
            font-weight: 600;
            color: {self.theme_manager.get_color("text_primary")};
            margin-bottom: 12px;
            letter-spacing: -0.5px;
            """
        )
        left_layout.addWidget(self.title)

        self.subtitle = QLabel()
        self.subtitle.setText(
            f'<div style="line-height: 1.5; font-size: 15px; color: {self.theme_manager.get_color("text_secondary")}; font-weight: 400; letter-spacing: 0.1px;">Connect Inten to your preferred LLM by adding the API key</div>'
        )
        self.subtitle.setWordWrap(True)
        self.subtitle.setStyleSheet("margin-bottom: 24px;")
        left_layout.addWidget(self.subtitle)

        # Provider custom buttons
        self.provider_buttons = []
        for idx, provider in enumerate(self.PROVIDERS):
            btn = ProviderSelectButton(
                provider["name"], provider["desc"], idx, self.theme_manager
            )
            btn.clicked.connect(self.handle_api_type_change)
            btn.set_selected(idx == 0)
            left_layout.addWidget(btn)
            self.provider_buttons.append(btn)

        # Continue button under provider buttons
        self.continue_button = QPushButton("Continue")
        self.continue_button.setObjectName("onboarding-primary")
        self.continue_button.setFixedHeight(44)
        self.continue_button.setFixedWidth(240)
        self.continue_button.setEnabled(False)
        left_layout.addStretch()
        left_layout.addWidget(self.continue_button)

        # Right: Input and helper
        right_widget = QWidget()
        right_layout = QVBoxLayout(right_widget)
        right_layout.setSpacing(24)
        right_layout.setAlignment(Qt.AlignmentFlag.AlignTop)

        self.right_title = QLabel()
        self.right_title.setStyleSheet(
            f"font-size: 20px; font-weight: 600; color: {self.theme_manager.get_color('text_primary')}; margin-bottom: 8px; background-color: transparent;"
        )
        right_layout.addWidget(self.right_title)
        right_widget.setStyleSheet(
            f"background-color: {self.theme_manager.get_color('background')}; border-top-left-radius: 18px; border: none;"
        )

        self.api_key_input = QLineEdit()
        self.api_key_input.setPlaceholderText("Enter your API key")
        self.api_key_input.setStyleSheet(
            f"""
            QLineEdit {{
                background-color: rgba(255, 255, 255, 0.15);
                padding: 8px 12px;
                border-radius: 8px;
                color: {self.theme_manager.get_color("text_primary")};
                font-size: 14px;
                selection-color: {self.theme_manager.get_color("text_primary")};
                selection-background-color: {self.theme_manager.get_color("text_primary")};
            }}
            """
        )
        self.api_key_input.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        right_layout.addWidget(self.api_key_input)

        right_layout.addStretch()

        # Add left and right widgets to the main layout
        outer_layout.addWidget(left_widget, stretch=1)
        outer_layout.addWidget(right_widget, stretch=2)
        parent_layout.addWidget(outer_container)

        # --- Animation Section ---
        self._animation_refs = []  # Prevent GC

        def start_animations():
            # Fade in the whole page
            opacity_effect = QGraphicsOpacityEffect(outer_container)
            outer_container.setGraphicsEffect(opacity_effect)
            opacity_anim = QPropertyAnimation(opacity_effect, b"opacity")
            opacity_anim.setDuration(800)
            opacity_anim.setStartValue(0)
            opacity_anim.setEndValue(1)
            opacity_anim.setEasingCurve(QEasingCurve.OutCubic)
            opacity_anim.start(QPropertyAnimation.DeleteWhenStopped)
            self._animation_refs.append(opacity_anim)
            # Slide in left_widget from the left
            left_start = left_widget.pos() - QPoint(60, 0)
            left_end = left_widget.pos()
            left_widget.move(left_start)
            left_anim = QPropertyAnimation(left_widget, b"pos")
            left_anim.setDuration(1000)
            left_anim.setStartValue(left_start)
            left_anim.setEndValue(left_end)
            left_anim.setEasingCurve(QEasingCurve.OutCubic)
            left_anim.start(QPropertyAnimation.DeleteWhenStopped)
            self._animation_refs.append(left_anim)
            # Slide in right_widget from the right
            right_start = right_widget.pos() + QPoint(60, 0)
            right_end = right_widget.pos()
            right_widget.move(right_start)
            right_anim = QPropertyAnimation(right_widget, b"pos")
            right_anim.setDuration(1000)
            right_anim.setStartValue(right_start)
            right_anim.setEndValue(right_end)
            right_anim.setEasingCurve(QEasingCurve.OutCubic)
            right_anim.start(QPropertyAnimation.DeleteWhenStopped)
            self._animation_refs.append(right_anim)

        QTimer.singleShot(0, start_animations)
        # --- End Animation Section ---

        # Connect signals
        self.api_key_input.textChanged.connect(self.handle_api_key_input_changed)

        # Initialize right pane
        self.handle_api_type_change(0)

        return self.continue_button

    def handle_api_type_change(self, idx):
        for i, btn in enumerate(self.provider_buttons):
            btn.set_selected(i == idx)
        self.selected_idx = idx
        provider = self.PROVIDERS[idx]
        self.selected_api_type = provider["name"].lower()
        self.api_key_input.blockSignals(True)
        self.api_key_input.setText(self.provider_keys.get(self.selected_api_type, ""))
        self.api_key_input.blockSignals(False)
        self._update_checkmarks()
        self.right_title.setText(f"{provider['name']} API Key")
        # Remove old helper widget if present
        if self.helper_widget:
            self.helper_widget.setParent(None)
            self.helper_widget.deleteLater()
            self.helper_widget = None
        url = None
        if self.selected_api_type == "openai":
            url = "https://platform.openai.com/api-keys"
        elif self.selected_api_type == "gemini":
            url = "https://aistudio.google.com/apikey"
        elif self.selected_api_type == "groq":
            url = "https://console.groq.com/keys"
        if url:
            self.helper_widget = KeyHelperButton(
                "Click here to get the key", url, self.theme_manager
            )
            self.right_title.parentWidget().layout().insertWidget(2, self.helper_widget)
        if self.selected_api_type == "ollama":
            self.api_key_input.setPlaceholderText(
                "Enter model name (e.g., llama3.2:latest)"
            )
        else:
            self.api_key_input.setPlaceholderText("Enter your API key")
        self.validate_inputs()

    def handle_api_key_input_changed(self, text):
        # Save the key for the selected provider
        self.provider_keys[self.selected_api_type] = text
        self.validate_inputs()

    def validate_inputs(self):
        is_valid = bool(self.api_key_input.text().strip())
        self.continue_button.setEnabled(is_valid)
        self._update_checkmarks()

    def _update_checkmarks(self):
        # Show checkmark for any provider with a non-empty key
        for i, btn in enumerate(self.provider_buttons):
            key = self.provider_keys.get(self.PROVIDERS[i]["name"].lower(), "")
            show = bool(key.strip())
            btn.set_checkmark(show)

    def get_configuration(self):
        """Get the current configuration based on selections"""
        config = {
            "OpenAI": {
                "api_key": "",
                "user_command_model": "gpt-4.1",
                "asr_model": "whisper-1",
            },
            "Gemini": {
                "api_key": "",
                "user_command_model": "gemini-2.0-flash",
                "asr_model": "gemini-2.0-flash",
            },
            "Groq": {
                "api_key": "",
                "user_command_model": "llama3-8b-8192",
                "asr_model": "whisper-large-v3",
            },
            "Ollama": {"model": ""},
            "ASR": {
                "source": "faster_whisper",  # Default, will be updated based on selection
                "model": "medium",
                "local_model_size": "base.en",
                "compute_type": "default",
            },
            "LLM": {"source": "", "max_tokens": 2000, "temperature": 0.7},
        }

        # Update API keys for all providers
        config["Groq"]["api_key"] = self.provider_keys.get("groq", "").strip()
        config["OpenAI"]["api_key"] = self.provider_keys.get("openai", "").strip()
        config["Gemini"]["api_key"] = self.provider_keys.get("gemini", "").strip()
        config["Ollama"]["model"] = self.provider_keys.get("ollama", "").strip()

        # Set source and model based on selected provider
        if self.selected_api_type == "groq":
            config["LLM"]["source"] = "groq_api"
            config["ASR"]["source"] = "groq_api"
            config["ASR"]["model"] = config["Groq"]["asr_model"]
        elif self.selected_api_type == "openai":
            config["LLM"]["source"] = "openai_api"
            config["ASR"]["source"] = "openai_api"
            config["ASR"]["model"] = config["OpenAI"]["asr_model"]
        elif self.selected_api_type == "gemini":
            config["LLM"]["source"] = "gemini_api"
            config["ASR"]["source"] = "gemini_api"
            config["ASR"]["model"] = config["Gemini"]["asr_model"]
        elif self.selected_api_type == "ollama":
            config["LLM"]["source"] = "ollama"
            config["ASR"]["source"] = "faster_whisper"
            config["ASR"]["model"] = "medium"

        return config

    def cleanup(self):
        """Clean up resources"""
        # Disconnect theme change signal
        self.theme_manager.theme_changed.disconnect(self.update_styles)

        if self.provider_buttons:
            for btn in self.provider_buttons:
                btn.deleteLater()
        if self.api_key_input:
            self.api_key_input.deleteLater()
        if self.continue_button:
            self.continue_button.deleteLater()
        if self.helper_widget:
            self.helper_widget.deleteLater()
        if self.right_title:
            self.right_title.deleteLater()
        if self.title:
            self.title.deleteLater()
        if self.subtitle:
            self.subtitle.deleteLater()

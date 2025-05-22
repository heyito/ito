from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QWidget,
    QLineEdit,
    QSizePolicy,
    QListWidget,
    QListWidgetItem,
    QFrame,
)
from PySide6.QtGui import QPixmap, QCursor, QDesktopServices
from PySide6.QtCore import QUrl
from src.ui.theme.manager import ThemeManager
from src.ui.components.menu_button import MenuButton


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
        self.left_bar.setFixedWidth(4)
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

    def open_url_event(self, event):
        QDesktopServices.openUrl(QUrl(self.url))


class BrainSetupScreen:
    PROVIDERS = [
        {"name": "Groq", "desc": "Fastest"},
        {"name": "OpenAI", "desc": "Highest Quality"},
        {"name": "Gemini", "desc": "Balanced"},
        {"name": "Ollama", "desc": "Local"},
    ]

    def __init__(self, theme_manager: ThemeManager):
        self.theme_manager = theme_manager
        self.selected_brain_type = "groq"  # Default to Groq
        self.api_key_input = None
        self.continue_button = None
        self.provider_buttons = []
        self.helper_widget = None
        self.right_title = None
        self.selected_idx = 0
        self.provider_keys = {
            provider["name"].lower(): "" for provider in self.PROVIDERS
        }

    def create(self, parent_layout):
        # Main centering container
        outer_container = QWidget()
        outer_layout = QHBoxLayout(outer_container)
        outer_layout.setContentsMargins(0, 0, 0, 0)
        outer_layout.setSpacing(0)
        outer_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # Left: Provider menu (sidebar)
        left_widget = QWidget()
        left_widget.setFixedWidth(300)
        left_layout = QVBoxLayout(left_widget)
        left_layout.setContentsMargins(32, 32, 32, 32)
        left_layout.setSpacing(4)
        left_layout.setAlignment(Qt.AlignmentFlag.AlignTop)

        title = QLabel("API Key Setup")
        title.setStyleSheet(
            f"""
            font-size: 28px;
            font-weight: 600;
            color: {self.theme_manager.get_color("text_primary")};
            margin-bottom: 12px;
            letter-spacing: -0.5px;
            """
        )
        left_layout.addWidget(title)

        subtitle = QLabel()
        subtitle.setText(
            f'<div style="line-height: 1.5; font-size: 15px; color: {self.theme_manager.get_color("text_secondary")}; font-weight: 400; letter-spacing: 0.1px;">Connect Inten to your preferred LLM by adding the API key</div>'
        )
        subtitle.setWordWrap(True)
        subtitle.setStyleSheet("margin-bottom: 24px;")
        left_layout.addWidget(subtitle)

        # Provider custom buttons
        self.provider_buttons = []
        for idx, provider in enumerate(self.PROVIDERS):
            btn = ProviderSelectButton(
                provider["name"], provider["desc"], idx, self.theme_manager
            )
            btn.clicked.connect(self.handle_brain_type_change)
            btn.set_selected(idx == 0)
            left_layout.addWidget(btn)
            self.provider_buttons.append(btn)

        # Continue button under provider buttons
        self.continue_button = QPushButton("Continue")
        self.continue_button.setObjectName("onboarding-primary")
        self.continue_button.setFixedHeight(44)
        self.continue_button.setFixedWidth(120)
        self.continue_button.setEnabled(False)
        left_layout.addStretch()
        left_layout.addWidget(self.continue_button)

        # Right: Input and helper
        right_widget = QWidget()
        right_layout = QVBoxLayout(right_widget)
        right_layout.setContentsMargins(32, 32, 32, 32)
        right_layout.setSpacing(24)
        right_layout.setAlignment(Qt.AlignmentFlag.AlignTop)

        self.right_title = QLabel()
        self.right_title.setStyleSheet(
            f"font-size: 20px; font-weight: 600; color: {self.theme_manager.get_color('text_primary')}; margin-bottom: 8px;"
        )
        right_layout.addWidget(self.right_title)
        right_widget.setStyleSheet("""
            #key_helper_button {
                border: 2px solid red;
                border-radius: 14px;
                background: transparent;
            }
        """)

        self.api_key_input = QLineEdit()
        self.api_key_input.setPlaceholderText("Enter your API key")
        self.api_key_input.setStyleSheet(
            """
            QLineEdit {
                background-color: rgba(255, 255, 255, 0.15);
                padding: 8px 12px;
                border-radius: 8px;
                color: #fff;
                font-size: 14px;
            }
            """
        )
        self.api_key_input.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        right_layout.addWidget(self.api_key_input)

        right_layout.addStretch()

        # Add left and right widgets to the main layout
        outer_layout.addWidget(left_widget, stretch=1)
        outer_layout.addWidget(right_widget, stretch=2)
        parent_layout.addWidget(outer_container)

        # Connect signals
        self.api_key_input.textChanged.connect(self.handle_api_key_input_changed)

        # Initialize right pane
        self.handle_brain_type_change(0)

        return self.continue_button

    def handle_brain_type_change(self, idx):
        for i, btn in enumerate(self.provider_buttons):
            btn.set_selected(i == idx)
        self.selected_idx = idx
        provider = self.PROVIDERS[idx]
        self.selected_brain_type = provider["name"].lower()
        self.api_key_input.blockSignals(True)
        self.api_key_input.setText(self.provider_keys.get(self.selected_brain_type, ""))
        self.api_key_input.blockSignals(False)
        self._update_checkmarks()
        self.right_title.setText(f"{provider['name']} API Key")
        # Remove old helper widget if present
        if self.helper_widget:
            self.helper_widget.setParent(None)
            self.helper_widget.deleteLater()
            self.helper_widget = None
        url = None
        if self.selected_brain_type == "openai":
            url = "https://platform.openai.com/api-keys"
        elif self.selected_brain_type == "gemini":
            url = "https://aistudio.google.com/apikey"
        elif self.selected_brain_type == "groq":
            url = "https://console.groq.com/keys"
        if url:
            self.helper_widget = KeyHelperButton(
                "Click here to get the key", url, self.theme_manager
            )
            self.right_title.parentWidget().layout().insertWidget(2, self.helper_widget)
        if self.selected_brain_type == "ollama":
            self.api_key_input.setPlaceholderText(
                "Enter model name (e.g., llama3.2:latest)"
            )
        else:
            self.api_key_input.setPlaceholderText("Enter your API key")
        self.validate_inputs()

    def handle_api_key_input_changed(self, text):
        # Save the key for the selected provider
        self.provider_keys[self.selected_brain_type] = text
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
                "device": "auto",
                "compute_type": "default",
            },
            "LLM": {"source": "", "max_tokens": 2000, "temperature": 0.7},
        }

        if self.selected_brain_type == "groq":
            config["Groq"]["api_key"] = self.api_key_input.text().strip()
            config["LLM"]["source"] = "groq_api"
            config["ASR"]["source"] = "groq_api"
            config["ASR"]["model"] = config["Groq"]["asr_model"]
        elif self.selected_brain_type == "openai":
            config["OpenAI"]["api_key"] = self.api_key_input.text().strip()
            config["LLM"]["source"] = "openai_api"
            config["ASR"]["source"] = "openai_api"
            config["ASR"]["model"] = config["OpenAI"]["asr_model"]
        elif self.selected_brain_type == "gemini":
            config["Gemini"]["api_key"] = self.api_key_input.text().strip()
            config["LLM"]["source"] = "gemini_api"
            config["ASR"]["source"] = "gemini_api"
            config["ASR"]["model"] = config["Gemini"]["asr_model"]
        elif self.selected_brain_type == "ollama":
            config["Ollama"]["model"] = self.api_key_input.text().strip()
            config["LLM"]["source"] = "ollama"
            config["ASR"]["source"] = "faster_whisper"
            config["ASR"]["model"] = "medium"

        return config

    def cleanup(self):
        """Clean up resources"""
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

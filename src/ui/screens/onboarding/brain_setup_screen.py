from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QVBoxLayout,
    QLabel,
    QPushButton,
    QWidget,
    QLineEdit,
    QSizePolicy,
)
from src.ui.theme.manager import ThemeManager
from src.ui.components.segmented_button_group import SegmentedButtonGroup


class BrainSetupScreen:
    def __init__(self, theme_manager: ThemeManager):
        self.theme_manager = theme_manager
        self.selected_brain_type = "groq"  # Default to Groq
        self.api_key_input = None
        self.continue_button = None
        self.brain_type_group = None

    def create(self, parent_layout):
        # Main centering container
        outer_container = QWidget()
        outer_layout = QVBoxLayout(outer_container)
        outer_layout.setContentsMargins(0, 0, 0, 0)
        outer_layout.setSpacing(0)
        outer_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # Inner content container
        container = QWidget()
        container_layout = QVBoxLayout(container)
        container_layout.setContentsMargins(0, 0, 0, 0)
        container_layout.setSpacing(32)
        container_layout.setAlignment(Qt.AlignmentFlag.AlignVCenter)

        # Title
        title = QLabel("Configure the Brain")
        title.setObjectName("permission_text")
        title.setStyleSheet(
            f"""
            font-size: 28px;
            font-weight: 600;
            color: {self.theme_manager.get_color("text_primary")};
            margin-top: 0px;
            margin-bottom: 6px;
            letter-spacing: -0.5px;
            """
        )
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        container_layout.addWidget(title)

        # Subtitle
        subtitle = QLabel("Choose your preferred AI provider")
        subtitle.setObjectName("permission_text")
        subtitle.setStyleSheet(
            f"""
            font-size: 15px;
            color: {self.theme_manager.get_color("text_secondary")};
            font-weight: 400;
            margin-bottom: 40px;
            letter-spacing: 0.1px;
            """
        )
        subtitle.setAlignment(Qt.AlignmentFlag.AlignCenter)
        container_layout.addWidget(subtitle)

        # SegmentedButtonGroup (left aligned, expanding)
        self.brain_type_group = SegmentedButtonGroup(
            [
                "Groq (Fastest)",
                "OpenAI (Highest Quality)",
                "Gemini (Balanced)",
                "Ollama (Local)",
            ]
        )
        self.brain_type_group.setMinimumWidth(750)
        container_layout.addWidget(
            self.brain_type_group, alignment=Qt.AlignmentFlag.AlignLeft
        )

        # QLineEdit (left aligned, expanding)
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
        container_layout.addWidget(
            self.api_key_input, alignment=Qt.AlignmentFlag.AlignLeft
        )

        # Add stretch to push content to center vertically
        container_layout.addStretch()

        # Continue button (centered)
        self.continue_button = QPushButton("Continue")
        self.continue_button.setObjectName("onboarding-primary")
        self.continue_button.setStyleSheet(
            f"""
            QPushButton#onboarding-primary {{
                background-color: {self.theme_manager.get_color("onboarding.button.background")};
                color: {self.theme_manager.get_color("onboarding.button.text")};
                border: none;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 600;
                padding: 0 14px;
                min-height: 32px;
                min-width: 160px;
                letter-spacing: 0.2px;
            }}
            QPushButton#onboarding-primary:hover {{
                background-color: {self.theme_manager.get_color("onboarding.button.hover")};
            }}
            QPushButton#onboarding-primary:disabled {{
                background-color: {self.theme_manager.get_color("onboarding.button.disabled")};
                color: {self.theme_manager.get_color("onboarding.button.disabled_text")};
            }}
            """
        )
        self.continue_button.setEnabled(False)
        container_layout.addWidget(
            self.continue_button, alignment=Qt.AlignmentFlag.AlignCenter
        )

        # Add the inner container to the outer centering layout
        outer_layout.addWidget(container, alignment=Qt.AlignmentFlag.AlignCenter)
        parent_layout.addWidget(outer_container)

        # Connect signals
        self.brain_type_group.selectionChanged.connect(self.handle_brain_type_change)
        self.api_key_input.textChanged.connect(self.validate_inputs)

        return self.continue_button

    def handle_brain_type_change(self):
        """Handle brain type selection change"""
        selected_text = self.brain_type_group.currentText()
        # Extract the provider name from the text (remove the description in parentheses)
        self.selected_brain_type = selected_text.split(" (")[0].lower()

        # Update input label and placeholder based on brain type
        if self.selected_brain_type == "ollama":
            self.api_key_input.setPlaceholderText(
                "Enter model name (e.g., llama3.2:latest)"
            )
        else:
            self.api_key_input.setPlaceholderText("Enter your API key")

        # Validate inputs
        self.validate_inputs()

    def validate_inputs(self):
        """Validate inputs and enable/disable continue button"""
        is_valid = bool(self.api_key_input.text().strip())
        self.continue_button.setEnabled(is_valid)

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
        if self.brain_type_group:
            self.brain_type_group.deleteLater()
        if self.api_key_input:
            self.api_key_input.deleteLater()
        if self.continue_button:
            self.continue_button.deleteLater()

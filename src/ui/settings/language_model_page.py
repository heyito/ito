import logging

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QDoubleSpinBox,
    QFormLayout,
    QLabel,
    QLineEdit,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from src.constants import DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE
from src.ui.components.segmented_button_group import SegmentedButtonGroup

logger = logging.getLogger(__name__)


class LanguageModelPage(QWidget):
    settings_changed = Signal()

    def __init__(self, theme_manager, app_manager, style_callbacks, parent=None):
        super().__init__(parent)
        self.theme_manager = theme_manager
        self.app_manager = app_manager
        self.set_page_title_style = style_callbacks["set_page_title_style"]
        self.set_label_style = style_callbacks["set_label_style"]
        self.set_line_edit_style = style_callbacks["set_line_edit_style"]

        self._internal_labels_for_styling = []
        self._init_ui()
        self._connect_signals()
        self._update_model_visibility()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        self.title_label = QLabel("Language Model Settings")
        self.set_page_title_style(self.title_label)
        layout.addWidget(self.title_label, alignment=Qt.AlignmentFlag.AlignLeft)
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
        self._internal_labels_for_styling.append(llm_source_label)
        llm_source_container = QWidget()
        llm_source_inner_layout = QVBoxLayout(llm_source_container)
        llm_source_inner_layout.setContentsMargins(0, 0, 0, 0)
        llm_source_inner_layout.setSpacing(4)
        llm_source_inner_layout.addWidget(llm_source_label)
        llm_source_inner_layout.addWidget(self.llm_source)
        llm_form_layout.addRow(llm_source_container)
        self.llm_model_edit = QLineEdit()
        self.llm_model_edit.setMaximumWidth(300)
        self.set_line_edit_style(self.llm_model_edit)
        llm_model_edit_label = QLabel("Ollama Model")
        self.set_label_style(llm_model_edit_label)
        self._internal_labels_for_styling.append(llm_model_edit_label)
        self.llm_model_edit_container = QWidget()
        llm_model_edit_layout = QVBoxLayout(self.llm_model_edit_container)
        llm_model_edit_layout.setContentsMargins(0, 0, 0, 0)
        llm_model_edit_layout.setSpacing(4)
        llm_model_edit_layout.addWidget(llm_model_edit_label)
        llm_model_edit_layout.addWidget(self.llm_model_edit)
        llm_form_layout.addRow(self.llm_model_edit_container)
        self.openai_model = SegmentedButtonGroup(
            ["gpt-4.1", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"]
        )
        openai_model_label = QLabel("OpenAI Model")
        self.set_label_style(openai_model_label)
        self._internal_labels_for_styling.append(openai_model_label)
        self.openai_model_container = QWidget()
        openai_model_layout = QVBoxLayout(self.openai_model_container)
        openai_model_layout.setContentsMargins(0, 0, 0, 0)
        openai_model_layout.setSpacing(4)
        openai_model_layout.addWidget(openai_model_label)
        openai_model_layout.addWidget(self.openai_model)
        llm_form_layout.addRow(self.openai_model_container)
        self.gemini_model = SegmentedButtonGroup(["gemini-2.0-flash"])
        gemini_model_label = QLabel("Gemini Model")
        self.set_label_style(gemini_model_label)
        self._internal_labels_for_styling.append(gemini_model_label)
        self.gemini_model_container = QWidget()
        gemini_model_layout = QVBoxLayout(self.gemini_model_container)
        gemini_model_layout.setContentsMargins(0, 0, 0, 0)
        gemini_model_layout.setSpacing(4)
        gemini_model_layout.addWidget(gemini_model_label)
        gemini_model_layout.addWidget(self.gemini_model)
        llm_form_layout.addRow(self.gemini_model_container)
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
        self._internal_labels_for_styling.append(groq_model_label)
        self.groq_model_container = QWidget()
        groq_model_layout = QVBoxLayout(self.groq_model_container)
        groq_model_layout.setContentsMargins(0, 0, 0, 0)
        groq_model_layout.setSpacing(4)
        groq_model_layout.addWidget(groq_model_label)
        groq_model_layout.addWidget(self.groq_model)
        llm_form_layout.addRow(self.groq_model_container)
        self.max_tokens = QSpinBox()
        self.max_tokens.setRange(1, 25000)
        self.max_tokens.setValue(DEFAULT_MAX_TOKENS)
        self.max_tokens.setStyleSheet(
            f"QSpinBox {{ background-color: rgba(255, 255, 255, 0.15); padding: 8px 12px; border-radius: 8px; color: {self.theme_manager.get_color('text_primary')}; font-size: 15px; }}"
        )
        self.max_tokens.setMaximumWidth(300)
        max_tokens_label = QLabel("Max Tokens")
        self.set_label_style(max_tokens_label)
        self._internal_labels_for_styling.append(max_tokens_label)
        max_tokens_container = QWidget()
        max_tokens_layout = QVBoxLayout(max_tokens_container)
        max_tokens_layout.setContentsMargins(0, 0, 0, 0)
        max_tokens_layout.setSpacing(4)
        max_tokens_layout.addWidget(max_tokens_label)
        max_tokens_layout.addWidget(self.max_tokens)
        llm_form_layout.addRow(max_tokens_container)
        self.temperature = QDoubleSpinBox()
        self.temperature.setRange(0.0, 1.0)
        self.temperature.setSingleStep(0.1)
        self.temperature.setValue(DEFAULT_TEMPERATURE)
        self.temperature.setStyleSheet(
            f"QDoubleSpinBox {{ background-color: rgba(255, 255, 255, 0.15); padding: 8px 12px; border-radius: 8px; color: {self.theme_manager.get_color('text_primary')}; font-size: 15px; }}"
        )
        self.temperature.setMaximumWidth(300)
        temperature_label = QLabel("Temperature")
        self.set_label_style(temperature_label)
        self._internal_labels_for_styling.append(temperature_label)
        temperature_container = QWidget()
        temperature_layout = QVBoxLayout(temperature_container)
        temperature_layout.setContentsMargins(0, 0, 0, 0)
        temperature_layout.setSpacing(4)
        temperature_layout.addWidget(temperature_label)
        temperature_layout.addWidget(self.temperature)
        llm_form_layout.addRow(temperature_container)
        layout.addWidget(llm_form_content)
        layout.addStretch()

    def _connect_signals(self):
        self.llm_source.selectionChanged.connect(
            self._on_llm_source_changed_by_interaction
        )
        self.llm_model_edit.textChanged.connect(lambda: self.settings_changed.emit())
        self.openai_model.selectionChanged.connect(lambda: self.settings_changed.emit())
        self.gemini_model.selectionChanged.connect(lambda: self.settings_changed.emit())
        self.groq_model.selectionChanged.connect(lambda: self.settings_changed.emit())
        self.max_tokens.valueChanged.connect(lambda: self.settings_changed.emit())
        self.temperature.valueChanged.connect(lambda: self.settings_changed.emit())

    # This public method is called from home.py
    def _update_ui_for_llm_source(self):
        """Public method to update UI visibility when source is changed externally."""
        self._update_model_visibility()

    def _on_llm_source_changed_by_interaction(self):
        """Handles llm_source change from user interaction and emits settings_changed."""
        logger.debug(
            f"LanguageModelPage: LLM source changed by interaction to {self.llm_source.currentText()}"
        )
        self._update_model_visibility()
        self.settings_changed.emit()  # Emit signal only for user-driven changes

    def update_styles(self):
        self.set_page_title_style(self.title_label)
        for label in self._internal_labels_for_styling:
            self.set_label_style(label)
        self.set_line_edit_style(self.llm_model_edit)
        self.max_tokens.setStyleSheet(
            f"QSpinBox {{ background-color: rgba(255, 255, 255, 0.15); padding: 8px 12px; border-radius: 8px; color: {self.theme_manager.get_color('text_primary')}; font-size: 15px; }}"
        )
        self.temperature.setStyleSheet(
            f"QDoubleSpinBox {{ background-color: rgba(255, 255, 255, 0.15); padding: 8px 12px; border-radius: 8px; color: {self.theme_manager.get_color('text_primary')}; font-size: 15px; }}"
        )

    def get_settings(self):
        llm_source_value = self.llm_source.currentText()
        current_active_llm_model_value = ""
        if llm_source_value == "ollama":
            current_active_llm_model_value = self.llm_model_edit.text()
        elif llm_source_value == "openai_api":
            current_active_llm_model_value = self.openai_model.currentText()
        elif llm_source_value == "groq_api":
            current_active_llm_model_value = self.groq_model.currentText()
        elif llm_source_value == "gemini_api":
            current_active_llm_model_value = self.gemini_model.currentText()
        return {
            "source": llm_source_value,
            "model": current_active_llm_model_value,
            "max_tokens": self.max_tokens.value(),
            "temperature": self.temperature.value(),
            "ollama_model": self.llm_model_edit.text(),
            "openai_user_command_model": self.openai_model.currentText(),
            "gemini_user_command_model": self.gemini_model.currentText(),
            "groq_user_command_model": self.groq_model.currentText(),
        }

    def load_settings(
        self, llm_config, ollama_config, openai_config, gemini_config, groq_config
    ):
        widgets_to_block = [
            self.llm_source,
            self.llm_model_edit,
            self.openai_model,
            self.gemini_model,
            self.groq_model,
            self.max_tokens,
            self.temperature,
        ]
        for widget in widgets_to_block:
            widget.blockSignals(True)
        try:
            self.llm_source.setCurrentText(llm_config.get("source", "ollama"))
            self.max_tokens.setValue(llm_config.get("max_tokens", DEFAULT_MAX_TOKENS))
            self.temperature.setValue(
                llm_config.get("temperature", DEFAULT_TEMPERATURE)
            )
            self.llm_model_edit.setText(ollama_config.get("model", "llama3.2:latest"))
            self.openai_model.setCurrentText(
                openai_config.get("user_command_model", "gpt-4.1")
            )
            self.gemini_model.setCurrentText(
                gemini_config.get("user_command_model", "gemini-2.0-flash")
            )
            self.groq_model.setCurrentText(
                groq_config.get("user_command_model", "llama-3.3-70b-versatile")
            )
            self._update_model_visibility()
        finally:
            for widget in widgets_to_block:
                widget.blockSignals(False)

    def _update_model_visibility(self):
        source = self.llm_source.currentText()
        self.llm_model_edit_container.setVisible(source == "ollama")
        self.openai_model_container.setVisible(source == "openai_api")
        self.gemini_model_container.setVisible(source == "gemini_api")
        self.groq_model_container.setVisible(source == "groq_api")

import logging

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QFormLayout,
    QLabel,
    QVBoxLayout,
    QWidget,
)

from src.ui.components.segmented_button_group import SegmentedButtonGroup

logger = logging.getLogger(__name__)


class SpeechRecognitionPage(QWidget):
    settings_changed = Signal()

    def __init__(self, theme_manager, app_manager, style_callbacks, parent=None):
        super().__init__(parent)
        self.theme_manager = theme_manager
        self.app_manager = app_manager
        self.set_page_title_style = style_callbacks["set_page_title_style"]
        self.set_label_style = style_callbacks["set_label_style"]
        self.set_widget_hidden_but_take_space = style_callbacks[
            "set_widget_hidden_but_take_space"
        ]

        self._internal_labels_for_styling = []

        self._init_ui()
        self._connect_signals()
        self._initial_visibility_setup()  # Call after UI is built

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        self.title_label = QLabel("Speech Recognition")
        self.set_page_title_style(self.title_label)
        layout.addWidget(self.title_label, alignment=Qt.AlignmentFlag.AlignLeft)

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

        # ASR Provider
        self.asr_source = SegmentedButtonGroup(
            ["openai_api", "faster_whisper", "groq_api", "gemini_api"]
        )
        asr_source_label = QLabel("ASR Provider")
        self.set_label_style(asr_source_label)
        self._internal_labels_for_styling.append(asr_source_label)
        asr_source_container = QWidget()
        asr_source_layout_inner = QVBoxLayout(
            asr_source_container
        )  # Renamed to avoid conflict
        asr_source_layout_inner.setContentsMargins(0, 0, 0, 0)
        asr_source_layout_inner.setSpacing(4)
        asr_source_layout_inner.addWidget(asr_source_label)
        asr_source_layout_inner.addWidget(self.asr_source)
        asr_form_layout.addRow(asr_source_container)

        # OpenAI ASR Model
        self.openai_asr_model = SegmentedButtonGroup(["whisper-1"])
        openai_asr_model_label = QLabel("OpenAI Model")
        self.set_label_style(openai_asr_model_label)
        self._internal_labels_for_styling.append(openai_asr_model_label)
        self.openai_asr_model_container = QWidget()
        openai_asr_model_layout = QVBoxLayout(self.openai_asr_model_container)
        openai_asr_model_layout.setContentsMargins(0, 0, 0, 0)
        openai_asr_model_layout.setSpacing(4)
        openai_asr_model_layout.addWidget(openai_asr_model_label)
        openai_asr_model_layout.addWidget(self.openai_asr_model)
        asr_form_layout.addRow(self.openai_asr_model_container)

        # Gemini ASR Model
        self.gemini_asr_model = SegmentedButtonGroup(["gemini-2.0-flash"])
        gemini_asr_model_label = QLabel("Gemini Model")
        self.set_label_style(gemini_asr_model_label)
        self._internal_labels_for_styling.append(gemini_asr_model_label)
        self.gemini_asr_model_container = QWidget()
        gemini_asr_model_layout = QVBoxLayout(self.gemini_asr_model_container)
        gemini_asr_model_layout.setContentsMargins(0, 0, 0, 0)
        gemini_asr_model_layout.setSpacing(4)
        gemini_asr_model_layout.addWidget(gemini_asr_model_label)
        gemini_asr_model_layout.addWidget(self.gemini_asr_model)
        asr_form_layout.addRow(self.gemini_asr_model_container)

        # Faster Whisper ASR Model
        self.faster_whisper_model = SegmentedButtonGroup(
            ["tiny", "base", "small", "medium", "large-v1", "large-v2", "large-v3"]
        )
        faster_whisper_model_label = QLabel("Local Whisper Model")
        self.set_label_style(faster_whisper_model_label)
        self._internal_labels_for_styling.append(faster_whisper_model_label)
        self.faster_whisper_model_container = QWidget()
        faster_whisper_model_layout = QVBoxLayout(self.faster_whisper_model_container)
        faster_whisper_model_layout.setContentsMargins(0, 0, 0, 0)
        faster_whisper_model_layout.setSpacing(4)
        faster_whisper_model_layout.addWidget(faster_whisper_model_label)
        faster_whisper_model_layout.addWidget(self.faster_whisper_model)
        asr_form_layout.addRow(self.faster_whisper_model_container)

        # Groq ASR Model
        self.groq_asr_model = SegmentedButtonGroup(
            ["whisper-large-v3", "whisper-large-v3-turbo", "distil-whisper-large-v3-en"]
        )
        groq_asr_model_label = QLabel("Groq Model")
        self.set_label_style(groq_asr_model_label)
        self._internal_labels_for_styling.append(groq_asr_model_label)
        self.groq_asr_model_container = QWidget()
        groq_asr_model_layout = QVBoxLayout(self.groq_asr_model_container)
        groq_asr_model_layout.setContentsMargins(0, 0, 0, 0)
        groq_asr_model_layout.setSpacing(4)
        groq_asr_model_layout.addWidget(groq_asr_model_label)
        groq_asr_model_layout.addWidget(self.groq_asr_model)
        asr_form_layout.addRow(self.groq_asr_model_container)

        # ASR Compute Type
        self.asr_compute_type = SegmentedButtonGroup(
            ["default", "int8", "int8_float16", "float16"]
        )
        self.asr_compute_type_label = QLabel("Compute Type")
        self.set_label_style(self.asr_compute_type_label)
        self._internal_labels_for_styling.append(self.asr_compute_type_label)
        self.asr_compute_type_container = QWidget()
        asr_compute_type_layout = QVBoxLayout(self.asr_compute_type_container)
        asr_compute_type_layout.setContentsMargins(0, 0, 0, 0)
        asr_compute_type_layout.setSpacing(4)
        asr_compute_type_layout.addWidget(self.asr_compute_type_label)
        asr_compute_type_layout.addWidget(self.asr_compute_type)
        asr_form_layout.addRow(self.asr_compute_type_container)

        layout.addWidget(asr_form_content)
        layout.addStretch()

    def _initial_visibility_setup(self):
        # Initial visibility based on a common default (e.g., OpenAI first, others hidden)
        # This will be refined by load_settings and _update_model_fields_visibility
        self.openai_asr_model_container.show()
        self.gemini_asr_model_container.hide()
        self.faster_whisper_model_container.hide()
        self.groq_asr_model_container.hide()
        self.update_compute_type_visibility()  # Ensure compute type is also set initially

    def _connect_signals(self):
        self.asr_source.selectionChanged.connect(self._on_asr_source_changed)
        self.openai_asr_model.selectionChanged.connect(
            lambda: self.settings_changed.emit()
        )
        self.gemini_asr_model.selectionChanged.connect(
            lambda: self.settings_changed.emit()
        )
        self.groq_asr_model.selectionChanged.connect(
            lambda: self.settings_changed.emit()
        )
        self.faster_whisper_model.selectionChanged.connect(
            lambda: self.settings_changed.emit()
        )
        self.asr_compute_type.selectionChanged.connect(
            lambda: self.settings_changed.emit()
        )

    def _on_asr_source_changed(self):
        self._update_model_fields_visibility()
        self.update_compute_type_visibility()
        self.settings_changed.emit()

    def update_styles(self):
        """Update styles for this page when theme changes."""
        self.set_page_title_style(self.title_label)
        for label in self._internal_labels_for_styling:
            self.set_label_style(label)

    def get_settings(self):
        """Returns a dictionary of ASR settings for the global configuration."""
        asr_source_value = self.asr_source.currentText()

        provider_model_value = ""
        if asr_source_value == "openai_api":
            provider_model_value = self.openai_asr_model.currentText()
        elif asr_source_value == "gemini_api":
            provider_model_value = self.gemini_asr_model.currentText()
        elif asr_source_value == "groq_api":
            provider_model_value = self.groq_asr_model.currentText()

        return {
            # For "ASR" section in config
            "source": asr_source_value,
            "model": provider_model_value,  # Model for the active API provider, or "" if local
            "local_model_size": self.faster_whisper_model.currentText(),
            "compute_type": self.asr_compute_type.currentText(),
            # For "OpenAI", "Gemini", "Groq" sections (their specific asr_model setting)
            "openai_selected_asr_model": self.openai_asr_model.currentText(),
            "gemini_selected_asr_model": self.gemini_asr_model.currentText(),
            "groq_selected_asr_model": self.groq_asr_model.currentText(),
        }

    def load_settings(self, asr_config, openai_config, gemini_config, groq_config):
        """Loads ASR settings into the UI elements of this page."""
        widgets_to_block = [
            self.asr_source,
            self.openai_asr_model,
            self.gemini_asr_model,
            self.groq_asr_model,
            self.faster_whisper_model,
            self.asr_compute_type,
        ]
        for widget in widgets_to_block:
            widget.blockSignals(True)

        try:
            self.asr_source.setCurrentText(asr_config.get("source", "openai_api"))

            # Set each provider's ASR model selector from its own config section first
            self.openai_asr_model.setCurrentText(
                openai_config.get("asr_model", "whisper-1")
            )
            self.gemini_asr_model.setCurrentText(
                gemini_config.get("asr_model", "gemini-2.0-flash")
            )
            self.groq_asr_model.setCurrentText(
                groq_config.get("asr_model", "distil-whisper-large-v3-en")
            )

            # Set faster_whisper model from ASR config
            self.faster_whisper_model.setCurrentText(
                asr_config.get("local_model_size", "base")
            )

            self.asr_compute_type.setCurrentText(
                asr_config.get("compute_type", "default")
            )

            # If ASR.model is set and corresponds to the current ASR.source,
            # ensure that provider's selector reflects ASR.model.
            current_asr_source = self.asr_source.currentText()
            asr_model_from_config = asr_config.get("model", "")

            if asr_model_from_config:  # Only override if ASR.model has a value
                if (
                    current_asr_source == "openai_api"
                    and asr_model_from_config in self.openai_asr_model.buttons
                ):
                    self.openai_asr_model.setCurrentText(asr_model_from_config)
                elif (
                    current_asr_source == "gemini_api"
                    and asr_model_from_config in self.gemini_asr_model.buttons
                ):
                    self.gemini_asr_model.setCurrentText(asr_model_from_config)
                elif (
                    current_asr_source == "groq_api"
                    and asr_model_from_config in self.groq_asr_model.buttons
                ):
                    self.groq_asr_model.setCurrentText(asr_model_from_config)

            self._update_model_fields_visibility()
            self.update_compute_type_visibility()

        finally:
            for widget in widgets_to_block:
                widget.blockSignals(False)

    def _update_model_fields_visibility(self):
        """Update ASR model fields visibility based on the selected ASR source."""
        asr_source = self.asr_source.currentText()

        self.openai_asr_model_container.hide()
        self.gemini_asr_model_container.hide()
        self.faster_whisper_model_container.hide()
        self.groq_asr_model_container.hide()

        if asr_source == "openai_api":
            self.openai_asr_model_container.show()
        elif asr_source == "gemini_api":
            self.gemini_asr_model_container.show()
        elif asr_source == "faster_whisper":
            self.faster_whisper_model_container.show()
        elif asr_source == "groq_api":
            self.groq_asr_model_container.show()
        else:  # Fallback, e.g. show OpenAI
            self.openai_asr_model_container.show()
            logger.warning(f"Unknown ASR source '{asr_source}', defaulting visibility.")

    def update_compute_type_visibility(self):
        """Shows/hides the compute type selector based on ASR source."""
        is_local_asr = self.asr_source.currentText() == "faster_whisper"
        self.set_widget_hidden_but_take_space(
            self.asr_compute_type_container, not is_local_asr
        )

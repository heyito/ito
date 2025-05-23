from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QPushButton,
    QSizePolicy,
    QWidget,
)

from src.ui.components.flow_layout import QFlowLayout
from src.ui.theme.manager import ThemeManager


class SegmentedButtonGroup(QWidget):
    selectionChanged = Signal(str)

    def __init__(self, options, parent=None, theme_manager: ThemeManager = None):
        super().__init__(parent)
        self.options = options
        self.theme_manager = theme_manager or ThemeManager.instance()
        self.selected = None
        self.buttons = []
        self.layout = QFlowLayout(self)
        self.layout.setContentsMargins(0, 0, 0, 0)
        self.layout.setSpacing(0)
        self.layout.setAlignment(Qt.AlignmentFlag.AlignLeft)
        self.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Fixed)

        # Connect to theme changes
        self.theme_manager.theme_changed.connect(self._update_styles)

        for i, option in enumerate(options):
            btn = QPushButton(option)
            btn.setCheckable(True)
            btn.clicked.connect(self._make_select_handler(option))
            btn.setStyleSheet(
                self._button_style(
                    selected=False, first=(i == 0), last=(i == len(options) - 1)
                )
            )
            btn.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
            self.layout.addWidget(btn)
            self.buttons.append(btn)
        if options:
            self.setCurrentText(options[0])

    def _make_select_handler(self, option):
        def handler():
            self.setCurrentText(option)
            self.selectionChanged.emit(option)

        return handler

    def setCurrentText(self, text):
        for i, btn in enumerate(self.buttons):
            selected = btn.text() == text
            btn.setChecked(selected)
            btn.setStyleSheet(
                self._button_style(
                    selected, first=(i == 0), last=(i == len(self.buttons) - 1)
                )
            )
        self.selected = text

    def currentText(self):
        return self.selected

    def _update_styles(self, theme):
        """Update all button styles when theme changes"""
        for i, btn in enumerate(self.buttons):
            selected = btn.isChecked()
            btn.setStyleSheet(
                self._button_style(
                    selected, first=(i == 0), last=(i == len(self.buttons) - 1)
                )
            )

    def _button_style(self, selected, first, last):
        # Get theme colors
        background = self.theme_manager.get_color("button.background")
        text_color = self.theme_manager.get_color("button.text")
        selected_bg = self.theme_manager.get_color("button.pressed")
        border_color = self.theme_manager.get_color("primary")

        # Disabled state colors
        try:
            disabled_text_color = self.theme_manager.get_color("text_disabled")
            if (
                disabled_text_color is None
            ):  # If get_color can return None for partial matches
                raise KeyError  # Treat as if key was not found at all for simplicity here
        except KeyError:
            try:
                disabled_text_color = self.theme_manager.get_color("text_secondary")
                if disabled_text_color is None:
                    raise KeyError
            except KeyError:
                disabled_text_color = "#888888"  # Ultimate fallback

        try:
            disabled_background_color = self.theme_manager.get_color(
                "button.disabled_background"
            )
            if disabled_background_color is None:
                raise KeyError
        except KeyError:
            disabled_background_color = background  # Fallback to normal background

        # Add rounded corners to first/last
        if first and last:
            border_radius = "border-radius: 8px;"
        elif first:
            border_radius = (
                "border-top-left-radius: 8px; border-bottom-left-radius: 8px;"
                "border-top-right-radius: 0; border-bottom-right-radius: 0;"
            )
        elif last:
            border_radius = (
                "border-top-right-radius: 8px; border-bottom-right-radius: 8px;"
                "border-top-left-radius: 0; border-bottom-left-radius: 0;"
            )
        else:
            border_radius = "border-radius: 0px;"
        # Add a visible border between buttons
        border = f"border-right: 1.5px solid {border_color};" if not last else ""
        # Highlight selected
        if selected:
            background_style = f"background: {selected_bg};"
            font_weight = "font-weight: 600;"
        else:
            background_style = f"background: {background};"
            font_weight = "font-weight: 500;"
        # Add extra vertical padding (e.g., 12px top/bottom)
        padding = "padding: 12px 20px;"
        return (
            f"QPushButton {{{background_style} color: {text_color}; {font_weight} {border_radius} {border} {padding}}}"
            f"QPushButton:disabled {{background: {disabled_background_color}; color: {disabled_text_color}; border-right: 1.5px solid {border_color if not last else 'transparent'};}}"
        )

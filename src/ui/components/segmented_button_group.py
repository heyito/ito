from PyQt6.QtWidgets import QWidget, QPushButton, QSizePolicy
from PyQt6.QtCore import pyqtSignal, Qt
from src.ui.components.flow_layout import QFlowLayout

class SegmentedButtonGroup(QWidget):
    selectionChanged = pyqtSignal(str)

    def __init__(self, options, parent=None):
        super().__init__(parent)
        self.options = options
        self.selected = None
        self.buttons = []
        self.layout = QFlowLayout(self)
        self.layout.setContentsMargins(0, 0, 0, 0)
        self.layout.setSpacing(0)
        self.layout.setAlignment(Qt.AlignmentFlag.AlignLeft)
        self.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Fixed)
        for i, option in enumerate(options):
            btn = QPushButton(option)
            btn.setCheckable(True)
            btn.clicked.connect(self._make_select_handler(option))
            btn.setStyleSheet(self._button_style(selected=False, first=(i==0), last=(i==len(options)-1)))
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
            selected = (btn.text() == text)
            btn.setChecked(selected)
            btn.setStyleSheet(self._button_style(selected, first=(i==0), last=(i==len(self.buttons)-1)))
        self.selected = text

    def currentText(self):
        return self.selected

    def _button_style(self, selected, first, last):
        base = """
            QPushButton {
                background: #F5F5F5;
                color: #181A2A;
                border: none;
                font-size: 16px;
                font-weight: 500;
                padding: 8px 20px;
                border-radius: 0px;
            }
            QPushButton:checked {
                background: #fff;
                color: #181A2A;
                font-weight: 600;
            }
        """
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
        # Add a subtle border between buttons
        border = "border-right: 1.5px solid #E0E0E0;" if not last else ""
        # Highlight selected
        if selected:
            background = "background: #fff;"
            font_weight = "font-weight: 600;"
        else:
            background = "background: #F5F5F5;"
            font_weight = "font-weight: 500;"
        return f"QPushButton {{{background} color: #181A2A; {font_weight} {border_radius} {border}}}"
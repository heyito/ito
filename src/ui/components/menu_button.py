from PyQt6.QtWidgets import QPushButton
from PyQt6.QtCore import Qt

class MenuButton(QPushButton):
    def __init__(self, text: str, menu_index: int, parent=None):
        super().__init__(text, parent)
        self.setObjectName("settings_button")
        self.setCheckable(True)
        self.setChecked(False)
        self.menu_index = menu_index
        
        # Set the common styling
        self.setStyleSheet('''
            QPushButton#settings_button {
                background: transparent;
                color: #FFFFFF;
                font-size: 15px;
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
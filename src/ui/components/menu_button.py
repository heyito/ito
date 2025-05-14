from PyQt6.QtWidgets import QPushButton
from PyQt6.QtCore import Qt, pyqtSlot
from src.ui.theme.manager import ThemeManager

class MenuButton(QPushButton):
    def __init__(self, text: str, menu_index: int, parent=None, theme_manager: ThemeManager=None):
        super().__init__(text, parent)
        self.setObjectName("settings_button")
        self.setCheckable(True)
        self.setChecked(False)
        self.menu_index = menu_index
        
        # Get theme manager instance
        self.theme_manager = theme_manager or ThemeManager.instance()
        
        # Connect to theme changes
        self.theme_manager.theme_changed.connect(self._on_theme_changed, Qt.ConnectionType.QueuedConnection)
        
        # Set initial style
        self._update_style()
    
    @pyqtSlot(str)
    def _on_theme_changed(self, new_theme):
        """Handle theme change signal"""
        self._update_style()
    
    def _update_style(self):
        """Update the button style based on current theme"""
        text_color = self.theme_manager.get_color('text_primary')
        button_text_color = self.theme_manager.get_color('button.text')
        hover_bg = self.theme_manager.get_color('button.hover')
        checked_bg = self.theme_manager.get_color('button.pressed')
        
        # Attempt to get a specific disabled text color, fallback to secondary or a hardcoded one
        try:
            disabled_text_color = self.theme_manager.get_color('text_disabled')
            if disabled_text_color is None: # If get_color can return None for partial matches
                raise KeyError # Treat as if key was not found at all for simplicity here
        except KeyError:
            try:
                disabled_text_color = self.theme_manager.get_color('text_secondary')
                if disabled_text_color is None:
                    raise KeyError
            except KeyError:
                disabled_text_color = '#888888' # Ultimate fallback

        disabled_bg_color = "transparent" # Keep background transparent for disabled menu buttons

        self.setStyleSheet(f'''
            QPushButton#settings_button {{
                background: transparent;
                color: {text_color};
                font-size: 15px;
                font-weight: 500;
                border-radius: 8px;
                padding: 12px 0px;
                margin: 8px 16px 8px 16px;
            }}
            QPushButton#settings_button:checked {{
                background: {checked_bg};
                color: {button_text_color};
            }}
            QPushButton#settings_button:hover {{
                background: {hover_bg};
                color: {button_text_color};
            }}
            QPushButton#settings_button:disabled {{
                background: {disabled_bg_color};
                color: {disabled_text_color};
                /* Optionally, remove hover effect for disabled state if it was conflicting */
                /* No specific hover for disabled, it just stays disabled */
            }}
        ''') 
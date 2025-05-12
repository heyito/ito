import objc
import sys
from PyQt6.QtCore import pyqtSignal, QObject
from src.ui.theme.theme import THEME

def is_dark_mode():
    """Check if macOS is in dark mode."""
    if sys.platform != 'darwin':
        return False
        
    try:
        from AppKit import NSAppearance, NSAppearanceNameDarkAqua
        
        appearance = NSAppearance.currentAppearance()
        return appearance.name() == NSAppearanceNameDarkAqua
    except ImportError:
        print("Warning: Could not import AppKit. Dark mode detection will be disabled.")
        return False
    except Exception as e:
        print(f"Error detecting dark mode: {e}")
        return False

class ThemeManager(QObject):
    _instance = None
    theme_changed = pyqtSignal(str)
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ThemeManager, cls).__new__(cls)
            cls._instance._initialize()
        return cls._instance
    
    def _initialize(self):
        super().__init__()  # Initialize QObject
        self._current_theme = "dark"  # Default to dark theme
        self._setup_appearance_observer()

    def _setup_appearance_observer(self):
        # Listen on the distributed center for the system Dark/Light toggle
        from AppKit import NSDistributedNotificationCenter
        nc = NSDistributedNotificationCenter.defaultCenter()
        nc.addObserver_selector_name_object_(
            self,
            'appearanceChanged:',
            'AppleInterfaceThemeChangedNotification',
            None
        )

    def appearanceChanged_(self, notification):
        """Called whenever the user switches Light ↔ Dark in System Settings."""
        self._update_theme()

    def _update_theme(self):
        """Update the theme based on the current appearance"""
        from AppKit import NSAppearance, NSAppearanceNameDarkAqua
        appearance = NSAppearance.currentAppearance()
        if appearance:
            appearance_name = appearance.name()
            new_theme = "dark" if appearance_name == NSAppearanceNameDarkAqua else "light"
            if new_theme != self._current_theme:
                self._current_theme = new_theme
                self.theme_changed.emit(new_theme)
    
    @property
    def current_theme(self):
        return self._current_theme
    
    def get_color(self, path):
        """Get a color from the theme using dot notation (e.g., 'button.background')"""
        parts = path.split('.')
        value = THEME[self._current_theme]
        for part in parts:
            value = value[part]
        
        # print an error if the color is not found
        if value is None:
            print(f"Color not found: {path}")
            
        return value
    
    def set_theme(self, theme_name):
        """Manually set the theme"""
        if theme_name in THEME:
            self._current_theme = theme_name
            return True
        return False
    
    def toggle_theme(self):
        """Toggle between light and dark themes"""
        self._current_theme = "light" if self._current_theme == "dark" else "dark"
        return self._current_theme

import sys

def is_dark_mode():
    """Check if macOS is in dark mode."""
    if sys.platform != 'darwin':
        return False
        
    try:
        import objc
        from AppKit import NSAppearance, NSAppearanceNameDarkAqua
        
        appearance = NSAppearance.currentAppearance()
        return appearance.name() == NSAppearanceNameDarkAqua
    except ImportError:
        print("Warning: Could not import AppKit. Dark mode detection will be disabled.")
        return False
    except Exception as e:
        print(f"Error detecting dark mode: {e}")
        return False

class ThemeManager:
    _instance = None
    theme_changed = pyqtSignal(str)
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ThemeManager, cls).__new__(cls)
            cls._instance._initialize()
        return cls._instance
    
    def _initialize(self):
        self._current_theme = "dark"  # Default to dark theme
        self._setup_appearance_observer()

    def _setup_appearance_observer(self):
        if not _objc_available:
            return
            
        # Create a notification observer for appearance changes
        workspace = NSWorkspace.sharedWorkspace()
        notification_center = workspace.notificationCenter()
        
        # Define the callback function
        def appearance_changed(notification):
            self._update_theme()
        
        # Add observer for appearance changes
        notification_center.addObserver_selector_name_object_(
            self,
            'appearance_changed:',
            'NSWorkspaceDidChangeNotification',
            None
        )

    def _update_theme(self):
        """Update the theme based on the current appearance"""
        if not _objc_available:
            return
            
        # Get the current appearance
        appearance = NSAppearance.currentAppearance()
        if appearance:
            appearance_name = appearance.name()
            new_theme = "dark" if appearance_name == NSAppearanceNameDarkAqua else "light"
            if new_theme != self._current_theme:
                print(f"Theme changed to: {new_theme} from {self._current_theme}")
                self._current_theme = new_theme
                self.theme_changed.emit(new_theme)
    
    @property
    def current_theme(self):
        return self._current_theme
    
    def get_color(self, path):
        """Get a color from the theme using dot notation (e.g., 'button.background')"""
        parts = path.split('.')
        value = self._theme_data[self._current_theme]
        for part in parts:
            value = value[part]
        return value
    
    def set_theme(self, theme_name):
        """Manually set the theme"""
        if theme_name in self._theme_data:
            self._current_theme = theme_name
            return True
        return False
    
    def toggle_theme(self):
        """Toggle between light and dark themes"""
        self._current_theme = "light" if self._current_theme == "dark" else "dark"
        return self._current_theme

import logging
import re

from PySide6.QtCore import QObject, Signal
from PySide6.QtGui import QColor

from src.ui.theme.theme import THEME

# Configure logging
logger = logging.getLogger(__name__)

# Inlined SVG logo content
LOGO_SVG = """<svg width="141" height="141" viewBox="0 0 141 141" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M125.837 88.3633C129.501 84.6822 132.622 80.4752 135.037 75.8738C138.947 68.4622 141 60.1469 141 51.7657C141 23.2206 117.787 0 89.2524 0C60.7172 0 37.5047 23.2206 37.5047 51.7657C37.5047 55.3482 37.8661 58.8322 38.5561 62.201C44.3058 62.4147 50.0227 63.8115 55.296 66.3752C53.3576 61.8888 52.2733 56.9423 52.2733 51.7493C52.2733 31.3552 68.849 14.7738 89.2359 14.7738C109.623 14.7738 126.199 31.3552 126.199 51.7493C126.199 61.9381 122.059 71.1902 115.373 77.8951C100.965 92.3073 77.5065 92.3073 63.0993 77.8951C48.6921 63.4829 25.2331 63.4829 10.8424 77.8951C4.15624 84.5836 0 93.8357 0 104.024C0 124.419 16.5757 141 36.9626 141C57.3495 141 72.6767 125.618 73.8431 106.276C68.5369 104.797 63.4278 102.513 58.6637 99.4724C58.9759 100.951 59.1402 102.463 59.1402 104.024C59.1402 116.251 49.1849 126.21 36.9626 126.21C24.7403 126.21 14.785 116.251 14.785 104.024C14.785 97.9112 17.2656 92.3566 21.274 88.3304C29.9151 79.6864 43.9937 79.6864 52.6347 88.3304C62.7214 98.4206 75.9787 103.466 89.2195 103.466C98.5669 103.466 107.865 100.919 115.882 96.1035C119.496 93.9343 122.831 91.3049 125.804 88.3304L125.837 88.3633Z" fill="white"/>
</svg>"""


class ThemeManager(QObject):
    _instance = None

    # Signal for when the theme changes
    theme_changed = Signal(str)

    @classmethod
    def instance(cls):
        if cls._instance is None:
            cls._instance = ThemeManager()
        return cls._instance

    def __init__(self):
        if ThemeManager._instance is not None:
            raise Exception("ThemeManager is a singleton! Use ThemeManager.instance()")
        super().__init__()
        self._current_theme = "dark" if self._get_appearance() else "light"
        self.theme_changed.emit(self._current_theme)
        self._setup_appearance_observer()

    def _get_appearance(self):
        """Get the current appearance"""
        from AppKit import NSAppearance, NSAppearanceNameDarkAqua

        appearance = NSAppearance.currentAppearance()
        return appearance.name() == NSAppearanceNameDarkAqua

    def _setup_appearance_observer(self):
        # Listen on the distributed center for the system Dark/Light toggle
        from AppKit import NSDistributedNotificationCenter

        nc = NSDistributedNotificationCenter.defaultCenter()
        nc.addObserver_selector_name_object_(
            self, "appearanceChanged:", "AppleInterfaceThemeChangedNotification", None
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
            new_theme = (
                "dark" if appearance_name == NSAppearanceNameDarkAqua else "light"
            )
            if new_theme != self._current_theme:
                self._current_theme = new_theme
                self.theme_changed.emit(new_theme)

    @property
    def current_theme(self):
        return self._current_theme

    def get_qcolor(self, path):
        """Get a color from the theme using dot notation (e.g., 'button.background')"""
        parts = path.split(".")
        value = THEME[self._current_theme]
        for part in parts:
            value = value[part]

        if value is None:
            logger.error(f"Color not found: {path}")
            return None

        return value

    def get_color(self, path):
        """Get a color from the theme using dot notation (e.g., 'button.background')"""
        value = self.get_qcolor(path)

        # If the value is a QColor, return it in rgba format
        if isinstance(value, QColor):
            # Format RGB as integers and alpha as a decimal between 0 and 1
            return f"rgba({int(value.red())}, {int(value.green())}, {int(value.blue())}, {value.alpha() / 255:.2f})"

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

    def get_logo_svg_content(self, fill_color):
        """
        Returns the SVG content as a string, replacing the fill color with the given value (e.g., 'white' or 'black').
        """
        try:
            # Replace fill color in the path element
            svg = re.sub(r'fill="[^"]*"', f'fill="{fill_color}"', LOGO_SVG)
            return svg
        except Exception as e:
            logger.error(f"Failed to process SVG logo: {e}")
            return None

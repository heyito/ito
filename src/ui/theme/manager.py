import logging
import os
import sys

from PySide6.QtCore import QObject, Signal
from PySide6.QtGui import QColor

from src.ui.theme.theme import THEME

# Configure logging
logger = logging.getLogger(__name__)


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

    def get_logo_path(self):
        """
        Returns the correct logo path for the current theme, compatible with PyInstaller bundles.
        """

        def resource_path(relative_path):
            if hasattr(sys, "_MEIPASS"):
                return os.path.join(sys._MEIPASS, relative_path)
            return os.path.join(os.path.abspath("."), relative_path)

        if self.current_theme == "light":
            logo_file = "ito-logo-dark.png"
        else:
            logo_file = "ito-logo.png"
        path = resource_path(logo_file)
        if os.path.exists(path):
            return path
        return None

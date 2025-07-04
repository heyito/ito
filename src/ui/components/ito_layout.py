import logging
import sys

from PySide6.QtCore import QRectF, Qt
from PySide6.QtGui import QPainterPath, QRegion
from PySide6.QtWidgets import QVBoxLayout, QWidget

from src.ui.theme.manager import ThemeManager

# Configure logging
logger = logging.getLogger(__name__)

# Conditionally import macOS-specific libraries at the module level
MAC_LIBS_AVAILABLE = False
NSVisualEffectMaterialPopover = None  # Placeholder for AppKit constant
NSColor = None  # Placeholder for NSColor

if sys.platform == "darwin":
    try:
        import objc
        from AppKit import NSColor as AppKitNSColor  # Import NSColor
        from AppKit import (
            NSFullSizeContentViewWindowMask,
            NSMakeRect,
            NSViewHeightSizable,
            NSViewWidthSizable,
            NSVisualEffectBlendingModeBehindWindow,
            NSVisualEffectStateActive,
            NSVisualEffectView,
            NSWindowBelow,
        )
        from AppKit import NSVisualEffectMaterialPopover as AppKitPopoverConst

        NSVisualEffectMaterialPopover = AppKitPopoverConst  # Assign to module-level var
        NSColor = AppKitNSColor  # Assign to module-level var
        MAC_LIBS_AVAILABLE = True
    except ImportError as e:
        logger.warning(
            f"macOS specific libraries (AppKit, objc, ctypes) could not be imported. Blur effects will be disabled. Error: {e}"
        )


def MacBlur(
    widget_instance: QWidget, corner_radius: float, Material=None, TitleBar: bool = True
):
    """
    Applies a native macOS blur effect (NSVisualEffectView) behind the given QWidget.
    Also attempts to round the corners of the native window and the blur view.

    Args:
        widget_instance: The QWidget to apply the blur behind.
        corner_radius: The radius for the corners.
        Material: The NSVisualEffectMaterial to use (e.g., NSVisualEffectMaterialPopover).
        TitleBar: Whether to configure the title bar for transparency.
    """
    if not MAC_LIBS_AVAILABLE:
        logger.warning(
            "MacBlur: Skipping because core macOS specific libraries are not available."
        )
        return

    # Determine the material to use for the blur effect
    if Material is None and NSVisualEffectMaterialPopover is not None:
        Material = NSVisualEffectMaterialPopover
    elif Material is None:  # Should not happen if NSVisualEffectMaterialPopover loaded
        logger.warning(
            "MacBlur: Skipping, no material specified and default (Popover) not available via AppKit."
        )
        return

    # Get the native window ID (NSView pointer) of the QWidget
    win_id_ptr = widget_instance.winId()
    if not win_id_ptr:
        logger.warning(
            "MacBlur: widget_instance.winId() is null. Cannot apply blur yet (widget might not be shown)."
        )
        return

    # Get the NSView object from the window ID
    widget_native_view = objc.objc_object(c_void_p=int(win_id_ptr))

    # Get the NSWindow object
    window_native_view = widget_native_view.window()
    if not window_native_view:
        logger.warning(f"MacBlur: Could not get NSWindow for widget {widget_instance}")
        return

    # --- Apply rounded corners and transparency to the NSWindow ---
    # Make the window transparent to allow rounded corners to show properly
    window_native_view.setOpaque_(False)
    if NSColor:  # Check if NSColor was imported successfully
        window_native_view.setBackgroundColor_(NSColor.clearColor())

    # Set the corner radius for the NSWindow itself
    # This is crucial for the overall window shape.
    if hasattr(window_native_view, "setCornerRadius_"):
        window_native_view.setCornerRadius_(corner_radius)
    elif hasattr(window_native_view, "contentView") and hasattr(
        window_native_view.contentView(), "setWantsLayer_"
    ):
        # Fallback for older macOS or different window types: try rounding contentView's layer
        content_view_for_radius = window_native_view.contentView()
        if content_view_for_radius:
            content_view_for_radius.setWantsLayer_(True)
            content_view_for_radius.layer().setCornerRadius_(corner_radius)
            content_view_for_radius.layer().setMasksToBounds_(True)

    # Define the frame for the visual effect view (same size as the widget)
    frame = NSMakeRect(0, 0, widget_instance.width(), widget_instance.height())

    # Create and configure the NSVisualEffectView
    visualEffectView = NSVisualEffectView.alloc().init()
    visualEffectView.setAutoresizingMask_(NSViewWidthSizable | NSViewHeightSizable)
    visualEffectView.setFrame_(frame)
    visualEffectView.setState_(NSVisualEffectStateActive)
    visualEffectView.setMaterial_(Material)
    visualEffectView.setBlendingMode_(NSVisualEffectBlendingModeBehindWindow)

    # --- Apply rounded corners to the NSVisualEffectView's layer ---
    visualEffectView.setWantsLayer_(True)  # Enable layer-backing for the view
    if visualEffectView.layer():  # Check if layer exists
        visualEffectView.layer().setCornerRadius_(corner_radius)
        visualEffectView.layer().setMasksToBounds_(
            True
        )  # Clip the blur to the rounded bounds

    # Get the window's content view to add the blur view
    window_content_view = window_native_view.contentView()
    if not window_content_view:
        logger.warning(
            f"MacBlur: Could not get contentView for NSWindow of widget {widget_instance}"
        )
        # Clean up visualEffectView if it was created? Or let ARC handle it.
        return

    # Add the visualEffectView to the window's content view, positioned behind other views
    if window_content_view == widget_native_view:
        # If the widget's native view IS the window's content view
        window_content_view.addSubview_positioned_relativeTo_(
            visualEffectView, NSWindowBelow, None
        )
    else:
        # If the widget is a child, place blur behind its specific native view
        window_content_view.addSubview_positioned_relativeTo_(
            visualEffectView, NSWindowBelow, widget_native_view
        )

    if TitleBar:
        window_native_view.setTitlebarAppearsTransparent_(True)
        window_native_view.setStyleMask_(
            window_native_view.styleMask() | NSFullSizeContentViewWindowMask
        )


# --- Mac-specific drag area for native window dragging ---
if sys.platform == "darwin":
    from PySide6.QtWidgets import QWidget

    class MacDragArea(QWidget):
        def mousePressEvent(self, event):
            try:
                from ctypes import c_void_p

                import objc
                from AppKit import NSApp

                win = self.window().winId()
                ns_view = objc.objc_object(c_void_p(int(win)))
                ns_window = ns_view.window()
                if ns_window:
                    # Convert Qt event to NSEvent
                    # Use the current event from NSApp
                    nsevent = NSApp.currentEvent()
                    ns_window.performWindowDragWithEvent_(nsevent)
            except Exception as e:
                logger.warning(f"Failed to perform native window drag: {e}")
            super().mousePressEvent(event)


class ItoLayout(QWidget):
    def __init__(
        self,
        parent=None,
        radius=8,
        show_close_button=False,
        close_callback=None,
        theme_manager: ThemeManager = None,
    ):
        super().__init__(parent)
        self.theme_manager = theme_manager
        self.theme_manager.theme_changed.connect(self._update_theme)
        self.radius = radius
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setAutoFillBackground(False)
        self.setContentsMargins(0, 0, 0, 0)
        self.layout = QVBoxLayout(self)
        self.layout.setContentsMargins(0, 0, 0, 0)
        self.layout.setSpacing(0)
        self.setStyleSheet(self._generate_stylesheet())

    def _update_theme(self):
        self.setStyleSheet(self._generate_stylesheet())
        self.update()

    def _generate_stylesheet(self):
        """Generate stylesheet using theme colors"""
        # Get colors from theme manager
        text_primary = self.theme_manager.get_color("text_primary")
        text_secondary = self.theme_manager.get_color("text_secondary")
        button_bg = self.theme_manager.get_color("button.background")
        button_text = self.theme_manager.get_color("button.text")
        button_hover = self.theme_manager.get_color("button.hover")
        _ = self.theme_manager.get_color("button.pressed")
        surface = self.theme_manager.get_color("surface")
        return f"""
            QWidget, QMainWindow {{
                font-family: 'Inter 18pt', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            }}
            QLabel {{ 
                color: {text_primary}; 
                background-color: transparent;
            }}
            QPushButton {{
                background-color: {button_bg};
                color: {button_text};
                border: none;
                padding: 8px 20px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 500;
            }}
            QPushButton:hover {{
                background-color: {button_hover};
            }}
            QPushButton:disabled {{
                background-color: {button_bg};
                color: {text_secondary};
            }}
            QProgressBar {{
                border: none;
                border-radius: 3px;
                text-align: center;
                background-color: {text_secondary};
                max-height: 6px;
                margin: 0px 2px;
            }}
            QProgressBar::chunk {{
                background-color: {button_bg};
                border-radius: 3px;
            }}
            QWidget#permission_row {{
                background-color: {surface};
                border-radius: 10px;
                min-height: 60px;
                padding: 0px;
                margin: 0px;
            }}
            QLabel#permission_status {{
                font-size: 13px;
                font-weight: 500;
                padding-right: 16px;
            }}
            QLabel#permission_text {{
                font-size: 15px;
                color: {text_secondary};
                font-weight: 400;
            }}
            QLabel#permission_icon {{
                font-size: 22px;
                min-width: 30px;
                margin-left: 16px;
            }}
        """

    def resizeEvent(self, event):
        super().resizeEvent(event)
        # Set rounded mask for the window if this is a top-level window
        if self.isWindow():
            rect = QRectF(0, 0, self.width(), self.height())
            path = QPainterPath()
            path.addRoundedRect(rect, self.radius, self.radius)
            region = QRegion(path.toFillPolygon().toPolygon())
            self.setMask(region)

    def showEvent(self, event):
        super().showEvent(event)
        if not event.spontaneous():  # Apply on first "real" show
            MacBlur(self, self.radius)

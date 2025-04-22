import sys
import traceback
from PyQt6.QtWidgets import QApplication, QMainWindow, QWidget, QVBoxLayout, QLabel
from PyQt6.QtCore import Qt, QPointF # Import QPointF for precise positions
from PyQt6.QtGui import QPixmap

# --- Platform specific code for macOS ---
# Keep this section for the transparent title bar styling
_ns_window = None
if sys.platform == 'darwin':
    try:
        import objc
        from AppKit import NSWindow, NSView, NSColor, NSWindowTitleHidden, NSFullSizeContentViewWindowMask
        from ctypes import c_void_p
        print("PyObjC found. Applying native macOS styling.")
        _objc_available = True
    except ImportError:
        print("PyObjC framework (pyobjc-framework-Cocoa) not found. Cannot apply native macOS styling.")
        traceback.print_exc()
        _objc_available = False
else:
    _objc_available = False
# --- End platform specific code ---

class SettingsWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Inten")
        self.setMinimumWidth(600)
        self.setMinimumHeight(400)

        # --- Manual Dragging Variables ---
        self._dragging = False
        self._drag_start_position = QPointF() # Use QPointF for accuracy
        # Store effective top margin for drag area calculation
        self._effective_top_margin = 40 # Default value


        # --- Apply Native macOS Styling (if available) ---
        if _objc_available:
            try:
                view_id_sip = self.winId()
                view_address = int(view_id_sip)
                view_ptr = c_void_p(view_address)
                ns_view = objc.objc_object(c_void_p=view_ptr)
                global _ns_window
                _ns_window = ns_view.window()

                if _ns_window:
                    _ns_window.setTitlebarAppearsTransparent_(True)
                    _ns_window.setStyleMask_(_ns_window.styleMask() | NSFullSizeContentViewWindowMask)
                    # _ns_window.setMovableByWindowBackground_(True) # REMOVE THIS - using manual drag now
                else:
                    print("Warning: Could not get NSWindow object.")
            except Exception as e:
                print(f"Error applying native styling: {e}")
                traceback.print_exc()


        # --- Qt Styling ---
        self.setStyleSheet("""
            QMainWindow { background-color: #ffffff; }
            QWidget#main_widget { background-color: transparent; }
            QLabel { color: #333333; background-color: transparent; }
        """)

        # --- Main widget and layout ---
        main_widget = QWidget()
        main_widget.setObjectName("main_widget")
        self.setCentralWidget(main_widget)
        layout = QVBoxLayout(main_widget)

        # --- Adjust Margins ---
        title_bar_offset = 0
        if _objc_available and _ns_window and (_ns_window.styleMask() & NSFullSizeContentViewWindowMask):
             title_bar_offset = 30 # Adjust if needed
             print(f"Applying top margin offset: {title_bar_offset}")

        base_top_margin = 40
        self._effective_top_margin = base_top_margin + title_bar_offset # Store for dragging check
        layout.setContentsMargins(40, self._effective_top_margin, 40, 40)
        layout.setSpacing(20)

        # --- UI Elements (Logo, Title, Subtitle) ---
        # Logo
        logo_label = QLabel()
        logo_path = "inten-logo.png"
        logo_pixmap = QPixmap(logo_path)
        if not logo_pixmap.isNull():
            scaled_pixmap = logo_pixmap.scaled(150, 150, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
            logo_label.setPixmap(scaled_pixmap)
        else:
            print(f"Warning: Logo image not found or failed to load from '{logo_path}'.")
            logo_label.setText("🎯")
            logo_label.setStyleSheet("font-size: 80px; background-color: transparent;")
        logo_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(logo_label)

        # Title Label
        title_label = QLabel("Inten")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet("""
            font-size: 32px; font-weight: bold; color: #2c3e50;
            margin-top: 10px; margin-bottom: 5px; background-color: transparent;
        """)
        layout.addWidget(title_label)

        # Subtitle Label
        subtitle_label = QLabel("Speak Your Intent, AI Crafts Your Words.")
        subtitle_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        subtitle_label.setStyleSheet("""
            font-size: 16px; color: #7f8c8d; margin-top: 0px;
            margin-bottom: 10px; background-color: transparent;
        """)
        layout.addWidget(subtitle_label)

        layout.addStretch()

    # --- Manual Dragging Event Handlers ---

    def mousePressEvent(self, event):
        # Initiate drag only if left button is pressed in the 'title bar' area
        if event.button() == Qt.MouseButton.LeftButton:
            # Check if the click Y position is within the effective top margin area
            # This acts as our draggable "title bar" region
            if event.position().y() < self._effective_top_margin:
                 self._dragging = True
                 # Store the initial global position of the mouse cursor
                 self._drag_start_position = event.globalPosition()
                 event.accept() # We handled this event
                 return # Prevent further processing

        # If not dragging or not left button, call the base class implementation
        super().mousePressEvent(event)


    def mouseMoveEvent(self, event):
        # Move the window if dragging is active
        # Check if dragging AND left button is still held down (redundant check often good)
        if self._dragging and event.buttons() & Qt.MouseButton.LeftButton:
            # Calculate the difference (delta) between current and start position
            delta = event.globalPosition() - self._drag_start_position
            # Move the window's top-left corner by the delta
            # Note: self.pos() is the window position, delta is QPointF, need conversion
            self.move(self.pos() + delta.toPoint())
            # IMPORTANT: Update the start position for the *next* move event.
            # This makes dragging relative to the last position, not the initial click.
            self._drag_start_position = event.globalPosition()
            event.accept()
            return

        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        # Stop dragging when the left button is released
        if event.button() == Qt.MouseButton.LeftButton:
            self._dragging = False
            event.accept()
            return

        super().mouseReleaseEvent(event)

# --- Application Execution Entry Point ---
if __name__ == '__main__':
    app = QApplication(sys.argv)
    settings_window = SettingsWindow()
    settings_window.show()
    sys.exit(app.exec())
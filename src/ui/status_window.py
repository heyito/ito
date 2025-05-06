import sys
from enum import Enum, auto
from PyQt6.QtCore import Qt, QPoint
from PyQt6.QtWidgets import QWidget, QLabel, QVBoxLayout
from PyQt6.QtGui import QColor, QPalette

class StatusMessage(Enum):
    """Enum for all possible status messages in the application."""
    READY = "Ready"
    STARTING = "Starting background application thread..."
    STARTED = "Application thread started. Listening for hotkey."
    STOPPED = "Application stopped"
    RESTARTING = "Restarting application..."
    SETTINGS_SAVED = "Settings saved."
    SETTINGS_SAVED_RESTARTING = "Settings saved. Restarting application..."
    HOTKEY_IGNORED = "Hotkey ignored: Application not running."
    HOTKEY_PRESSED = "Hotkey pressed, initiating command..."
    PROCESSING_BUSY = "Processing busy, please wait..."
    ALREADY_RECORDING = "Already recording..."
    LISTENING = "Listening for hotkey '{hotkey}'..."
    LISTENER_FAILED = "Hotkey listener failed to start!"
    ERROR = "Application error occurred"

    def format(self, **kwargs) -> str:
        """Format the status message with any provided keyword arguments."""
        return self.value.format(**kwargs)

if sys.platform == 'darwin':
    try:
        from ctypes import c_void_p
        import objc
        from AppKit import (
            NSWindow,
            NSWindowCollectionBehavior,
            NSWindowLevel,
            NSWindowStyleMask,
            NSWindowTitleHidden,
            NSFullSizeContentViewWindowMask,
            NSWindowCollectionBehaviorCanJoinAllSpaces,
            NSWindowCollectionBehaviorStationary,
            NSWindowCollectionBehaviorTransient,
            NSWindowCollectionBehaviorIgnoresCycle,
            NSWindowCollectionBehaviorFullScreenAuxiliary,
            NSWindowCollectionBehaviorFullScreenAllowsTiling,
        )
        _objc_available = True
    except ImportError:
        print("PyObjC framework not found. Cannot apply native macOS styling.")
        _objc_available = False
else:
    _objc_available = False

class StatusWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint |  # No window frame
            Qt.WindowType.Tool |                 # Tool window (no taskbar entry)
            Qt.WindowType.WindowStaysOnTopHint | # Always on top
            Qt.WindowType.NoDropShadowWindowHint # Remove shadow
        )
        
        # Set window attributes
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setAttribute(Qt.WidgetAttribute.WA_ShowWithoutActivating)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)  # Make it non-interactive
        
        # Create layout
        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 8, 12, 8)
        layout.setSpacing(0)  # Remove spacing between elements
        
        # Create status label
        self.status_label = QLabel(StatusMessage.READY.value)
        self.status_label.setStyleSheet("""
            QLabel {
                color: #8E8E93;
                font-size: 13px;
                background-color: rgba(255, 255, 255, 0.95);
                padding: 8px 16px;
                border-radius: 8px;
                border: 1px solid #E5E5EA;
            }
        """)
        layout.addWidget(self.status_label)
        
        # Set fixed size for the window
        self.setFixedWidth(300)  # Set a reasonable width
        self.adjustSize()  # Adjust height based on content
        
        # Apply native macOS window behavior if available
        if _objc_available:
            try:
                view_id_sip = self.winId()
                view_address = int(view_id_sip)
                view_ptr = c_void_p(view_address)
                ns_view = objc.objc_object(c_void_p=view_ptr)
                ns_window = ns_view.window()
                
                if ns_window:
                    # Make window float above all other windows
                    # Use a high window level to ensure it stays on top
                    # NSMainMenuWindowLevel is typically 24, so we'll use 25
                    ns_window.setLevel_(25)
                    
                    # Make window visible on all spaces/desktops and always on top
                    collection_behavior = (
                        NSWindowCollectionBehaviorCanJoinAllSpaces |
                        NSWindowCollectionBehaviorStationary |
                        NSWindowCollectionBehaviorTransient |
                        NSWindowCollectionBehaviorIgnoresCycle |
                        NSWindowCollectionBehaviorFullScreenAuxiliary |
                        NSWindowCollectionBehaviorFullScreenAllowsTiling
                    )
                    ns_window.setCollectionBehavior_(collection_behavior)
                    
                    # Remove title bar
                    ns_window.setTitlebarAppearsTransparent_(True)
                    ns_window.setStyleMask_(ns_window.styleMask() | NSFullSizeContentViewWindowMask)
                    
                    # Make window non-interactive
                    ns_window.setIgnoresMouseEvents_(True)
                    
                    # Ensure window stays on top
                    ns_window.setHidesOnDeactivate_(False)
                    
                    # Make window float
                    ns_window.setMovableByWindowBackground_(False)
                    ns_window.setMovable_(False)
            except Exception as e:
                print(f"Error applying native macOS window behavior: {e}")
                import traceback
                traceback.print_exc()
        
        # Ensure layout is complete and window is properly sized
        self.layout().activate()
        self.adjustSize()
        
        # Position window at bottom center of screen
        self.update_position()
        
    def update_position(self):
        """Update window position to bottom center of screen"""
        screen = self.screen()
        if screen:
            screen_geometry = screen.geometry()
            window_geometry = self.geometry()
            
            # Calculate x position (center horizontally)
            x = (screen_geometry.width() - window_geometry.width()) // 2
            
            # Calculate y position (just above dock)
            # Dock height is typically 60-70px, plus we want a small margin
            dock_height = 70
            margin = 10
            y = screen_geometry.height() - window_geometry.height() - dock_height - margin
            
            print(f"Window geometry: {window_geometry}")
            print(f"Screen geometry: {screen_geometry}")
            print(f"Calculated y position: {y}")
            print(f"Dock height: {dock_height}")
            print(f"Margin: {margin}")
            print(f"X position: {x}")
            
            self.move(x, y)
    
    def update_status(self, status: str | StatusMessage, is_error: bool = False):
        """Update the status text and style"""
        if isinstance(status, StatusMessage):
            status = status.value
        self.status_label.setText(status)
        if is_error:
            self.status_label.setStyleSheet("""
                QLabel {
                    color: #FF3B30;
                    font-size: 13px;
                    background-color: rgba(255, 255, 255, 0.95);
                    padding: 8px 16px;
                    border-radius: 8px;
                    border: 1px solid #E5E5EA;
                }
            """)
        else:
            self.status_label.setStyleSheet("""
                QLabel {
                    color: #8E8E93;
                    font-size: 13px;
                    background-color: rgba(255, 255, 255, 0.95);
                    padding: 8px 16px;
                    border-radius: 8px;
                    border: 1px solid #E5E5EA;
                }
            """) 
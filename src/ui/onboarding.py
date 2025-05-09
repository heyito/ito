import os
import platform
import sys
import traceback

import sounddevice as sd
from PyQt6.QtCore import QObject, QPointF, QSettings, Qt, QTimer, pyqtSignal, QRect, QRectF
from PyQt6.QtGui import QPixmap, QRegion, QPainterPath
from PyQt6.QtWidgets import (
    QApplication,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QProgressBar,
    QPushButton,
    QVBoxLayout,
    QWidget,
)
from src.ui.components.inten_layout import IntenLayout

# --- Platform specific code for macOS ---
_ns_window = None
if sys.platform == 'darwin':
    try:
        from ctypes import c_void_p

        import objc
        from AppKit import (
            NSColor,
            NSFullSizeContentViewWindowMask,
            NSView,
            NSWindow,
            NSWindowTitleHidden,
        )
        print("PyObjC found. Applying native macOS styling.")
        _objc_available = True
    except ImportError:
        print("PyObjC framework (pyobjc-framework-Cocoa) not found. Cannot apply native macOS styling.")
        traceback.print_exc()
        _objc_available = False
else:
    _objc_available = False

class PermissionChecker(QObject):
    permission_checked = pyqtSignal(str, bool)  # permission_name, is_granted

    def check_microphone(self):
        try:
            # Just try to query the default input device - this triggers permission check
            # without actually opening a stream
            device_info = sd.query_devices(kind='input')
            print(f"Microphone permission granted - found device: {device_info['name']}")
            self.permission_checked.emit('microphone', True)
        except sd.PortAudioError as e:
            print(f"Microphone permission error: {e}")
            self.permission_checked.emit('microphone', False)
        except Exception as e:
            print(f"Unexpected error checking microphone: {e}")
            traceback.print_exc()
            self.permission_checked.emit('microphone', False)

    def check_accessibility(self):
        if platform.system() == 'Darwin':
            try:
                from src import platform_utils_macos
                print("Checking accessibility permissions...")
                has_permission = platform_utils_macos.check_accessibility_permission()
                print(f"Accessibility permission check result: {has_permission}")
                self.permission_checked.emit('accessibility', has_permission)
            except ImportError as e:
                print(f"Error importing platform_utils_macos: {e}")
                self.permission_checked.emit('accessibility', False)
            except Exception as e:
                print(f"Error checking accessibility permission: {e}")
                traceback.print_exc()
                self.permission_checked.emit('accessibility', False)
        else:
            print("Not on macOS, assuming accessibility permissions granted")
            self.permission_checked.emit('accessibility', True)

class OnboardingWindow(QMainWindow):
    ORGANIZATION_NAME = "Inten" # CHANGE THIS
    APPLICATION_NAME = "Inten"

    def __init__(self):
        super().__init__()
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setWindowFlags(self.windowFlags() | Qt.WindowType.FramelessWindowHint)
        self.setWindowTitle("Inten")
        self.setMinimumWidth(900)
        self.setMinimumHeight(600)

        # --- Manual Dragging Variables ---
        self._dragging = False
        self._drag_start_position = QPointF()

        # --- Main widget and layout ---
        main_widget = IntenLayout(self, radius=8, show_close_button=True)
        main_widget.setObjectName("main_widget")
        self.setCentralWidget(main_widget)
        self.layout = main_widget.layout
        self._effective_top_margin = main_widget.get_effective_top_margin()
        self.layout.setContentsMargins(40, self._effective_top_margin, 40, 40)
        self.layout.setSpacing(20)

        # --- Initialize Permission Checker ---
        self.permission_checker = PermissionChecker()
        self.permission_checker.permission_checked.connect(self.handle_permission_check)

        # --- Initialize Permission States ---
        self.permission_states = {
            'microphone': False,
            'accessibility': False
        }

        # --- Show Welcome Screen ---
        self.settings = QSettings(self.ORGANIZATION_NAME, self.APPLICATION_NAME)
        # Use a specific key like 'permissionsSetupComplete'
        setup_complete = self.settings.value("permissionsSetupComplete", defaultValue=False, type=bool)

        if setup_complete:
            print("Permissions setup previously completed. Transitioning to home screen.")
            # Import here to avoid circular imports
            from src.ui.home_window import HomeWindow
            # Create home window but don't show it yet
            self.home_window = HomeWindow()
            # Hide this window before showing the home window
            self.hide()
            # Show the home window
            self.home_window.show()
            # Use a timer to close this window after a short delay
            QTimer.singleShot(0, self.close)
        else:
            print("Starting permissions setup flow.")
            # If setup not done, start with the welcome screen
            self.show_welcome_screen()
            # Now show the window
            self.show()

        # --- Debug logo path ---
        logo_paths = [
            "inten-logo.png",  # Development path
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "inten-logo.png"),  # Production path
        ]
        logo_pixmap = None
        for path in logo_paths:
            print(f"Trying logo path: {path}")
            if os.path.exists(path):
                logo_pixmap = QPixmap(path)
                if not logo_pixmap.isNull():
                    print(f"Loaded logo from: {path}")
                    break
        if not logo_pixmap or logo_pixmap.isNull():
            print("Logo not found, using fallback emoji.")

        # --- Onboarding Primary Button Style ---
        self.setStyleSheet(self.styleSheet() + """
            QPushButton#onboarding-primary {
                background-color: #F6EBDD;
                color: #181A2A;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 600;
                padding: 0 14px;
                min-height: 32px;
                min-width: 160px;
                letter-spacing: 0.2px;
            }
            QPushButton#onboarding-primary:hover {
                background-color: #f3e2c7;
            }
            QPushButton#onboarding-primary:disabled {
                background-color: #f3e2c7;
                color: #b0b0b0;
            }
        """)

    def clear_layout(self):
        """Helper function to remove all widgets from the main layout."""
        while self.layout.count():
            item = self.layout.takeAt(0)
            widget = item.widget()
            if widget is not None:
                widget.setParent(None)
            else:
                # Handle spacers or nested layouts if necessary
                layout = item.layout()
                if layout is not None:
                    # Basic clearing for nested layouts, might need recursion for deeper nests
                    while layout.count():
                         sub_item = layout.takeAt(0)
                         sub_widget = sub_item.widget()
                         if sub_widget is not None:
                              sub_widget.setParent(None)

    def show_welcome_screen(self):
        self.clear_layout()

        # --- Centered Layout ---
        content_layout = QVBoxLayout()
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.setSpacing(36)

        # Logo
        logo_label = QLabel()
        logo_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        logo_paths = [
            "inten-logo.png",
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "inten-logo.png"),
        ]
        logo_pixmap = None
        for path in logo_paths:
            if os.path.exists(path):
                logo_pixmap = QPixmap(path)
                if not logo_pixmap.isNull():
                    break
        if logo_pixmap and not logo_pixmap.isNull():
            scaled_pixmap = logo_pixmap.scaled(140, 140, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
            logo_label.setPixmap(scaled_pixmap)
            logo_label.setStyleSheet("QLabel { margin-bottom: 8px; }")
        else:
            logo_label.setText("🎯")
            logo_label.setStyleSheet("font-size: 80px; background-color: transparent; margin-bottom: 8px;")
        content_layout.addWidget(logo_label)

        # Title
        title_label = QLabel("Welcome to Inten")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet('''
            font-size: 36px;
            font-weight: 700;
            color: #F2E4D6;
            margin-top: 0px;
            margin-bottom: 6px;
            letter-spacing: -0.5px;
        ''')
        content_layout.addWidget(title_label)

        # Subtitle
        desc_label = QLabel("Let's set up your permissions to get started.")
        desc_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        desc_label.setStyleSheet('''
            font-size: 18px;
            color: rgba(242, 228, 214, 0.7);
            font-weight: 400;
            margin-bottom: 24px;
            letter-spacing: 0.1px;
        ''')
        content_layout.addWidget(desc_label)

        # Get Started Button
        start_button = QPushButton("Get Started")
        start_button.setObjectName("onboarding-primary")
        start_button.clicked.connect(self.show_permission_screen)
        start_button.setFixedHeight(44)
        start_button.setMinimumWidth(180)
        content_layout.addSpacing(8)
        content_layout.addWidget(start_button, alignment=Qt.AlignmentFlag.AlignCenter)

        # --- Center the content in the main layout ---
        self.layout.addStretch(2)
        self.layout.addLayout(content_layout)
        self.layout.addStretch(3)

    def show_permission_screen(self):
        self.clear_layout()

        # Title
        title_label = QLabel("Required Permissions")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet("""
            font-size: 28px; 
            font-weight: 600; 
            color: #F2E4D6;
            margin-top: 40px; 
            margin-bottom: 8px;
            letter-spacing: -0.5px;
        """)
        self.layout.addWidget(title_label)

        # Description
        desc_label = QLabel("Inten needs a few permissions to help you be more productive")
        desc_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        desc_label.setStyleSheet("""
            font-size: 15px; 
            color: rgba(242, 228, 214, 0.8);
            margin-bottom: 40px;
        """)
        self.layout.addWidget(desc_label)

        # Progress Bar
        self.progress_bar = QProgressBar() # Store as instance variable
        self.progress_bar.setRange(0, 2)
        self.progress_bar.setValue(0)
        self.progress_bar.setTextVisible(False)
        self.progress_bar.setFixedWidth(200)
        self.layout.addWidget(self.progress_bar, alignment=Qt.AlignmentFlag.AlignCenter)

        # Spacer
        self.layout.addSpacing(30)

        # Permissions Container
        permissions_container = QWidget()
        permissions_layout = QVBoxLayout(permissions_container)
        permissions_layout.setSpacing(12)
        permissions_layout.setContentsMargins(0, 0, 0, 0)

        # Microphone Permission
        mic_container = QWidget()
        mic_container.setObjectName("permission_row")
        mic_layout = QHBoxLayout(mic_container)
        mic_layout.setContentsMargins(0, 0, 16, 0)
        
        mic_icon = QLabel("🎤")
        mic_icon.setObjectName("permission_icon")
        mic_layout.addWidget(mic_icon)
        
        mic_text = QLabel("Microphone Access")
        mic_text.setObjectName("permission_text")
        mic_layout.addWidget(mic_text)
        
        mic_layout.addStretch()
        
        # Start status as "Checking..."
        self.mic_status = QLabel("Checking...")
        self.mic_status.setObjectName("permission_status")
        self.mic_status.setStyleSheet("color: rgba(242, 228, 214, 0.5);")
        mic_layout.addWidget(self.mic_status)
        
        mic_button = QPushButton("Grant Access")
        mic_button.clicked.connect(self.request_microphone_permission)
        mic_layout.addWidget(mic_button)
        
        permissions_layout.addWidget(mic_container)

        # Accessibility Permission
        acc_container = QWidget()
        acc_container.setObjectName("permission_row")
        acc_layout = QHBoxLayout(acc_container)
        acc_layout.setContentsMargins(0, 0, 16, 0)
        
        acc_icon = QLabel("⌨️")
        acc_icon.setObjectName("permission_icon")
        acc_layout.addWidget(acc_icon)
        
        acc_text = QLabel("Accessibility Access")
        acc_text.setObjectName("permission_text")
        acc_layout.addWidget(acc_text)
        
        acc_layout.addStretch()
        
        # Start status as "Checking..."
        self.acc_status = QLabel("Checking...")
        self.acc_status.setObjectName("permission_status")
        self.acc_status.setStyleSheet("color: rgba(242, 228, 214, 0.5);")
        acc_layout.addWidget(self.acc_status)
        
        acc_button = QPushButton("Grant Access")
        acc_button.clicked.connect(self.request_accessibility_permission)
        acc_layout.addWidget(acc_button)
        
        permissions_layout.addWidget(acc_container)
        
        # Add permissions container to main layout
        self.layout.addWidget(permissions_container)

        # Continue Button
        self.continue_button = QPushButton("Continue")
        self.continue_button.setObjectName("onboarding-primary")
        self.continue_button.clicked.connect(self.check_all_permissions_and_proceed)
        self.continue_button.setEnabled(False)
        self.continue_button.setFixedWidth(200)
        self.continue_button.setStyleSheet("""
            QPushButton {
                background-color: #F2E4D6;
                color: #141538;
                border: none;
                padding: 12px 0px;
                border-radius: 6px;
                font-size: 16px;
                font-weight: 500;
                margin-top: 40px;
            }
            QPushButton:hover {
                background-color: rgba(242, 228, 214, 0.8);
            }
            QPushButton:disabled {
                background-color: rgba(242, 228, 214, 0.3);
                color: rgba(224, 92, 92, 0.5);
            }
        """)
        self.layout.addWidget(self.continue_button, alignment=Qt.AlignmentFlag.AlignCenter)

        self.layout.addStretch()

        # Start checking permissions
        self.update_progress() # Initial progress
        QTimer.singleShot(100, self.permission_checker.check_microphone)
        QTimer.singleShot(200, self.permission_checker.check_accessibility)

    def handle_permission_check(self, permission, is_granted):
        print(f"Permission check result - {permission}: {is_granted}")
        self.permission_states[permission] = is_granted

        status_label = None
        grant_button = None
        
        if permission == 'microphone':
            self.mic_status.setText("Granted" if is_granted else "Not Granted")
            self.mic_status.setStyleSheet("color: #F2E4D6;" if is_granted else "color: rgba(242, 228, 214, 0.5);")
        elif permission == 'accessibility':
            self.acc_status.setText("Granted" if is_granted else "Not Granted")
            self.acc_status.setStyleSheet("color: #F2E4D6;" if is_granted else "color: rgba(242, 228, 214, 0.5);")

        if status_label:
            status_label.setText("Granted" if is_granted else "Not Granted")
            status_label.setStyleSheet("color: #F2E4D6;" if is_granted else "color: rgba(242, 228, 214, 0.5);")

        if grant_button:
            # Optionally disable/hide grant button if permission is granted
            grant_button.setVisible(not is_granted)
            # grant_button.setEnabled(not is_granted) # Or just disable
        
        self.update_progress()
        
        # Enable continue button if all permissions are granted
        self.continue_button.setEnabled(all(self.permission_states.values()))

    def update_progress(self):
        """Updates the progress bar based on granted permissions."""
        granted_count = sum(1 for granted in self.permission_states.values() if granted)
        if hasattr(self, 'progress_bar'): # Check if progress bar exists on current screen
            self.progress_bar.setValue(granted_count)

    def request_microphone_permission(self):
        if platform.system() == 'Darwin':
            # Also re-trigger the check after asking user
            os.system('open "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"')
            QTimer.singleShot(3000, self.permission_checker.check_microphone) # Check again after 3s
        else:
            # For other platforms, direct to system settings
            print("Please grant microphone access in your system settings")

    def request_accessibility_permission(self):
        if platform.system() == 'Darwin':
            # Also re-trigger the check after asking user
            os.system('open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"')
            QTimer.singleShot(3000, self.permission_checker.check_accessibility) # Check again after 3s
        else:
            # For other platforms, direct to system settings
            print("Please grant accessibility access in your system settings")

    def check_all_permissions_and_proceed(self):
        """Checks if all permissions are granted and proceeds to completion screen."""
        if all(self.permission_states.values()):
            self.show_completion_screen()
        else:
            # Show error message
            error_label = QLabel("Please grant all required permissions to continue")
            error_label.setStyleSheet("color: #e74c3c;")
            self.layout.addWidget(error_label)

    def show_completion_screen(self):
        self.clear_layout()

        # --- Centered Layout ---
        content_layout = QVBoxLayout()
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.setSpacing(28)

        # Centered icon container
        icon_container = QWidget()
        icon_layout = QHBoxLayout(icon_container)
        icon_layout.setContentsMargins(0, 0, 0, 0)
        icon_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # Minimal, soft checkmark icon in a pastel green circle
        check_icon = QLabel()
        check_icon.setAlignment(Qt.AlignmentFlag.AlignCenter)
        check_icon.setText("✓")
        check_icon.setFixedSize(56, 56)
        check_icon.setStyleSheet('''
            QLabel {
                background-color: #AEE9C1;
                color: #2E7D4F;
                font-size: 32px;
                border-radius: 28px;
                margin-bottom: 4px;
                font-weight: 500;
                letter-spacing: 1px;
            }
        ''')
        icon_layout.addWidget(check_icon)
        content_layout.addWidget(icon_container)
        content_layout.addSpacing(8)

        # Title
        title_label = QLabel("Setup Complete!")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet('''
            font-size: 28px;
            font-weight: 600;
            color: #F2E4D6;
            margin-top: 0px;
            margin-bottom: 6px;
            letter-spacing: -0.3px;
        ''')
        content_layout.addWidget(title_label)

        # Subtitle
        desc_label = QLabel("You're all set to start using Inten!")
        desc_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        desc_label.setStyleSheet('''
            font-size: 16px;
            color: rgba(242, 228, 214, 0.6);
            font-weight: 400;
            margin-bottom: 20px;
            letter-spacing: 0.05px;
        ''')
        content_layout.addWidget(desc_label)
        content_layout.addSpacing(8)

        # Start Button
        start_button = QPushButton("Start Using Inten")
        start_button.setObjectName("onboarding-primary")
        start_button.clicked.connect(self.complete_setup)
        start_button.setFixedHeight(38)
        start_button.setMinimumWidth(140)
        content_layout.addWidget(start_button, alignment=Qt.AlignmentFlag.AlignCenter)

        # --- Center the content in the main layout ---
        self.layout.addStretch(2)
        self.layout.addLayout(content_layout)
        self.layout.addStretch(3)

    def complete_setup(self):
        """Saves the setup complete flag if needed, then transitions to the home screen."""
        print("Marking permissions setup as complete in settings.")
        # Save the flag indicating setup is done
        self.settings.setValue("permissionsSetupComplete", True)
        
        # Import here to avoid circular imports
        from src.ui.home_window import HomeWindow
        
        # Create home window but don't show it yet
        self.home_window = HomeWindow()
        # Hide this window before showing the home window
        self.hide()
        # Show the home window
        self.home_window.show()
        # Use a timer to close this window after a short delay
        QTimer.singleShot(0, self.close)

    # --- Manual Dragging Event Handlers ---
    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            if event.position().y() < self._effective_top_margin:
                self._dragging = True
                self._drag_start_position = event.globalPosition()
                event.accept()
                return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self._dragging and event.buttons() & Qt.MouseButton.LeftButton:
            delta = event.globalPosition() - self._drag_start_position
            self.move(self.pos() + delta.toPoint())
            self._drag_start_position = event.globalPosition()
            event.accept()
            return
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self._dragging = False
            event.accept()
            return
        super().mouseReleaseEvent(event)

if __name__ == '__main__':
    app = QApplication(sys.argv)
    QApplication.setOrganizationName(OnboardingWindow.ORGANIZATION_NAME)
    QApplication.setApplicationName(OnboardingWindow.APPLICATION_NAME)
    onboarding_window = OnboardingWindow()
    onboarding_window.show()
    sys.exit(app.exec())
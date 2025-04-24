import sys
import traceback
import platform
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                           QLabel, QPushButton, QProgressBar, QHBoxLayout)
from PyQt6.QtCore import Qt, QPointF, QTimer, pyqtSignal, QObject, QSettings
from PyQt6.QtGui import QPixmap, QColor, QPalette
import sounddevice as sd
import pynput.keyboard
import os

# --- Platform specific code for macOS ---
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
                import platform_utils_macos
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

class SettingsWindow(QMainWindow):
    ORGANIZATION_NAME = "Inten" # CHANGE THIS
    APPLICATION_NAME = "Inten"

    def __init__(self):
        super().__init__()
        self.setWindowTitle("Inten")
        self.setMinimumWidth(900)
        self.setMinimumHeight(600)

        # --- Manual Dragging Variables ---
        self._dragging = False
        self._drag_start_position = QPointF()
        self._effective_top_margin = 40

        # --- Apply Native macOS Styling ---
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
                else:
                    print("Warning: Could not get NSWindow object.")
            except Exception as e:
                print(f"Error applying native styling: {e}")
                traceback.print_exc()

        # --- Qt Styling ---
        self.setStyleSheet("""
            QMainWindow { 
                background-color: #ffffff;
            }
            QWidget#main_widget { 
                background-color: transparent;
            }
            QLabel { 
                color: #333333; 
                background-color: transparent;
            }
            QPushButton {
                background-color: #0A84FF;
                color: white;
                border: none;
                padding: 8px 20px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 500;
            }
            QPushButton:hover {
                background-color: #007AFF;
            }
            QPushButton:disabled {
                background-color: #E5E5EA;
                color: #8E8E93;
            }
            QProgressBar {
                border: none;
                border-radius: 3px;
                text-align: center;
                background-color: #F2F2F7;
                max-height: 6px;
                margin: 0px 2px;
            }
            QProgressBar::chunk {
                background-color: #34C759;
                border-radius: 3px;
            }
            QWidget#permission_row {
                background-color: #F2F2F7;
                border-radius: 10px;
                min-height: 60px;
                padding: 0px;
                margin: 0px;
            }
            QLabel#permission_status {
                font-size: 13px;
                font-weight: 500;
                padding-right: 16px;
            }
            QLabel#permission_text {
                font-size: 15px;
                color: #000000;
                font-weight: 400;
            }
            QLabel#permission_icon {
                font-size: 22px;
                min-width: 30px;
                margin-left: 16px;
            }
        """)

        # --- Main widget and layout ---
        main_widget = QWidget()
        main_widget.setObjectName("main_widget")
        self.setCentralWidget(main_widget)
        self.layout = QVBoxLayout(main_widget)

        # --- Adjust Margins ---
        title_bar_offset = 30 if _objc_available and _ns_window and (_ns_window.styleMask() & NSFullSizeContentViewWindowMask) else 0
        self._effective_top_margin = 40 + title_bar_offset
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
            from home_window import HomeWindow
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

        # Logo
        logo_label = QLabel()
        logo_path = "inten-logo.png"
        logo_pixmap = QPixmap(logo_path)
        if not logo_pixmap.isNull():
            scaled_pixmap = logo_pixmap.scaled(150, 150, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
            logo_label.setPixmap(scaled_pixmap)
        else:
            logo_label.setText("🎯")
            logo_label.setStyleSheet("font-size: 80px; background-color: transparent;")
        logo_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.layout.addWidget(logo_label)

        # Title
        title_label = QLabel("Welcome to Inten")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet("""
            font-size: 32px; 
            font-weight: bold; 
            color: #2c3e50;
            margin-top: 10px; 
            margin-bottom: 5px;
        """)
        self.layout.addWidget(title_label)

        # Description
        desc_label = QLabel("Let's set up your permissions to get started.")
        desc_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        desc_label.setStyleSheet("""
            font-size: 16px; 
            color: #7f8c8d;
            margin-bottom: 30px;
        """)
        self.layout.addWidget(desc_label)

        # Start Button
        start_button = QPushButton("Get Started")
        start_button.clicked.connect(self.show_permission_screen)
        start_button.setStyleSheet("""
            QPushButton {
                background-color: #3498db;
                color: white;
                border: none;
                padding: 12px 30px;
                border-radius: 5px;
                font-size: 16px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #2980b9;
            }
        """)
        self.layout.addWidget(start_button, alignment=Qt.AlignmentFlag.AlignCenter)

        self.layout.addStretch()

    def show_permission_screen(self):
        self.clear_layout()

        # Title
        title_label = QLabel("Required Permissions")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet("""
            font-size: 28px; 
            font-weight: 600; 
            color: #000000;
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
            color: #666666;
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
        self.mic_status.setStyleSheet("color: #FF3B30;")
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
        self.acc_status.setStyleSheet("color: #FF3B30;")
        acc_layout.addWidget(self.acc_status)
        
        acc_button = QPushButton("Grant Access")
        acc_button.clicked.connect(self.request_accessibility_permission)
        acc_layout.addWidget(acc_button)
        
        permissions_layout.addWidget(acc_container)
        
        # Add permissions container to main layout
        self.layout.addWidget(permissions_container)

        # Continue Button
        self.continue_button = QPushButton("Continue")
        self.continue_button.clicked.connect(self.check_all_permissions_and_proceed) # Changed connection
        self.continue_button.setEnabled(False)
        self.continue_button.setFixedWidth(200)
        self.continue_button.setStyleSheet("""
            QPushButton {
                background-color: #34C759;
                color: white;
                border: none;
                padding: 12px 0px;
                border-radius: 6px;
                font-size: 15px;
                font-weight: 500;
                margin-top: 40px;
            }
            QPushButton:hover {
                background-color: #30B955;
            }
            QPushButton:disabled {
                background-color: #E5E5EA;
                color: #8E8E93;
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
            self.mic_status.setStyleSheet("color: #34C759;" if is_granted else "color: #FF3B30;")
        elif permission == 'accessibility':
            self.acc_status.setText("Granted" if is_granted else "Not Granted")
            self.acc_status.setStyleSheet("color: #34C759;" if is_granted else "color: #FF3B30;")

        if status_label:
            status_label.setText("Granted" if is_granted else "Not Granted")
            status_label.setStyleSheet("color: #34C759;" if is_granted else "color: #FF3B30;")

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

        # Success Icon
        success_icon = QLabel("✅")
        success_icon.setStyleSheet("font-size: 80px;")
        success_icon.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.layout.addWidget(success_icon)

        # Title
        title_label = QLabel("Setup Complete!")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet("""
            font-size: 32px; 
            font-weight: bold; 
            color: #2c3e50;
            margin-top: 20px; 
            margin-bottom: 10px;
        """)
        self.layout.addWidget(title_label)

        # Description
        desc_label = QLabel("You're all set to start using Inten!")
        desc_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        desc_label.setStyleSheet("""
            font-size: 16px; 
            color: #7f8c8d;
            margin-bottom: 30px;
        """)
        self.layout.addWidget(desc_label)

        # Start Button
        start_button = QPushButton("Start Using Inten")
        start_button.clicked.connect(self.complete_setup)
        start_button.setStyleSheet("""
            QPushButton {
                background-color: #2ecc71;
                color: white;
                border: none;
                padding: 12px 30px;
                border-radius: 5px;
                font-size: 16px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #27ae60;
            }
        """)
        self.layout.addWidget(start_button, alignment=Qt.AlignmentFlag.AlignCenter)

        self.layout.addStretch()

    def complete_setup(self):
        """Saves the setup complete flag if needed, then transitions to the home screen."""
        print("Marking permissions setup as complete in settings.")
        # Save the flag indicating setup is done
        self.settings.setValue("permissionsSetupComplete", True)
        
        # Import here to avoid circular imports
        from home_window import HomeWindow
        
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
    QApplication.setOrganizationName(SettingsWindow.ORGANIZATION_NAME)
    QApplication.setApplicationName(SettingsWindow.APPLICATION_NAME)
    settings_window = SettingsWindow()
    settings_window.show()
    sys.exit(app.exec())
import os
import platform
import sys
import traceback

import sounddevice as sd
from PySide6.QtCore import QObject, Signal, Qt, QSettings, QPoint, QTimer
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import (
    QApplication,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QPushButton,
    QVBoxLayout,
    QWidget,
)
from src.ui.components.inten_layout import IntenLayout
from src.ui.theme.manager import ThemeManager
from src.ui.keyboard_manager import KeyboardManager
from src.ui.screens.onboarding.permission_screen import PermissionScreen

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
    permission_checked = Signal(str, bool)  # permission_name, is_granted

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

    def __init__(self, theme_manager: ThemeManager):
        super().__init__()
        self.theme_manager = theme_manager
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setWindowFlags(self.windowFlags() | Qt.WindowType.FramelessWindowHint)
        self.setWindowTitle("Inten")
        self.setMinimumWidth(900)
        self.setMinimumHeight(600)

        # Connect theme changes
        self.theme_manager.theme_changed.connect(self.update_styles)

        # --- Manual Dragging Variables ---
        self._dragging = False
        self._drag_start_position = QPoint()

        # --- Main widget and layout ---
        main_widget = IntenLayout(self, radius=8, show_close_button=True, theme_manager=self.theme_manager)
        main_widget.setObjectName("main_widget")
        self.setCentralWidget(main_widget)
        self.layout = main_widget.layout
        self._effective_top_margin = main_widget.get_effective_top_margin()
        self.layout.setContentsMargins(40, self._effective_top_margin, 40, 40)
        self.layout.setSpacing(20)

        # --- Initialize Permission Checker ---
        self.permission_checker = PermissionChecker()
        
        # --- Initialize Permission States ---
        self.permission_states = {
            'microphone': False,
            'accessibility': False
        }

        # --- Initialize Keyboard Manager ---
        self.keyboard_manager = KeyboardManager.instance()
        self.current_hotkey = None
        self.is_recording_hotkey = False

        # --- Show Welcome Screen ---
        self.settings = QSettings(self.ORGANIZATION_NAME, self.APPLICATION_NAME)
        setup_complete = self.settings.value("permissionsSetupComplete", defaultValue=False, type=bool)

        if setup_complete:
            print("Permissions setup previously completed. Transitioning to home screen.")
            # Import here to avoid circular imports
            from src.ui.home_window import HomeWindow
            # Create home window but don't show it yet
            self.home_window = HomeWindow(theme_manager=self.theme_manager)
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

        logo_path = self.theme_manager.get_logo_path()
        logo_pixmap = None
        if logo_path:
            logo_pixmap = QPixmap(logo_path)
            if not logo_pixmap.isNull():
                print(f"Loaded logo from: {logo_path}")
        if not logo_pixmap or logo_pixmap.isNull():
            print("Logo not found, using fallback emoji.")

        # Apply initial styles
        self.update_styles(self.theme_manager.current_theme)

    def update_styles(self, new_theme):
        """Update all styles based on current theme"""
        # Update primary button style
        self.setStyleSheet(f"""
            QPushButton#onboarding-primary {{
                background-color: {self.theme_manager.get_color('onboarding.button.background')};
                color: {self.theme_manager.get_color('onboarding.button.text')};
                border: none;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 600;
                padding: 0 14px;
                min-height: 32px;
                min-width: 160px;
                letter-spacing: 0.2px;
            }}
            QPushButton#onboarding-primary:hover {{
                background-color: {self.theme_manager.get_color('onboarding.button.hover')};
            }}
            QPushButton#onboarding-primary:disabled {{
                background-color: {self.theme_manager.get_color('onboarding.button.disabled')};
                color: {self.theme_manager.get_color('onboarding.button.disabled_text')};
            }}
        """)

        # Update logo if present
        if hasattr(self, 'logo_label'):
            self.update_logo_pixmap()

        # Update current screen styles
        self.update_current_screen_styles()

    def update_current_screen_styles(self):
        """Update styles for the current screen"""
        # Find all QLabels and update their styles
        for widget in self.findChildren(QLabel):
            if widget.objectName() == "permission_text":
                widget.setStyleSheet(f"color: {self.theme_manager.get_color('text_primary')};")
            elif widget.objectName() == "permission_status":
                # Check if this is a status label that should be updated
                if hasattr(self, 'mic_status') and widget == self.mic_status:
                    is_granted = self.permission_states.get('microphone', False)
                    widget.setStyleSheet(f"color: {self.theme_manager.get_color('text_primary')};" if is_granted else f"color: {self.theme_manager.get_color('text_secondary')};")
                elif hasattr(self, 'acc_status') and widget == self.acc_status:
                    is_granted = self.permission_states.get('accessibility', False)
                    widget.setStyleSheet(f"color: {self.theme_manager.get_color('text_primary')};" if is_granted else f"color: {self.theme_manager.get_color('text_secondary')};")

        # Update any error messages
        for widget in self.findChildren(QLabel):
            if widget.text() == "Please grant all required permissions to continue":
                widget.setStyleSheet(f"color: {self.theme_manager.get_color('error')};")

        # Update completion screen checkmark if it exists
        for widget in self.findChildren(QLabel):
            if widget.text() == "✓":
                widget.setStyleSheet(f'''
                    QLabel {{
                        background-color: {self.theme_manager.get_color('onboarding.success.background')};
                        color: {self.theme_manager.get_color('onboarding.success.text')};
                        font-size: 32px;
                        border-radius: 28px;
                        margin-bottom: 4px;
                        font-weight: 500;
                        letter-spacing: 1px;
                    }}
                ''')

        # Update title and subtitle labels
        for widget in self.findChildren(QLabel):
            if widget.text() in ["Welcome to Inten", "Required Permissions", "Setup Complete!", "Set Up Your Keyboard Shortcut"]:
                widget.setStyleSheet(f'''
                    font-size: {28 if widget.text() != "Welcome to Inten" and widget.text() != "Set Up Your Keyboard Shortcut" else 36 if widget.text() == "Welcome to Inten" else 34}px;
                    font-weight: {600 if widget.text() != "Welcome to Inten" else 700};
                    color: {self.theme_manager.get_color('text_primary')};
                    margin-top: 0px;
                    margin-bottom: 6px;
                    letter-spacing: -0.5px;
                ''')
            elif widget.text() in ["Let's set up your permissions to get started.", 
                                 "Inten needs a few permissions to help you be more productive",
                                 "You're all set to start using Inten!",
                                 "Press and Hold any key or key combination to set your shortcut"]:
                widget.setStyleSheet(f'''
                    font-size: {15 if widget.text() == "Inten needs a few permissions to help you be more productive" else 16 if widget.text() == "Press any key or key combination to set your shortcut" else 18}px;
                    color: {self.theme_manager.get_color('text_secondary')};
                    font-weight: 400;
                    margin-bottom: {40 if widget.text() == "Inten needs a few permissions to help you be more productive" else 10 if widget.text() == "Press any key or key combination to set your shortcut" else 24}px;
                    letter-spacing: 0.1px;
                ''')

        # Update keyboard setup screen elements
        for widget in self.findChildren(QWidget):
            if hasattr(widget, 'objectName') and widget.objectName() == "keyboard_container":
                widget.setStyleSheet(f'''
                    background: {self.theme_manager.get_color('surface')};
                    border-radius: 22px;
                ''')
            elif hasattr(widget, 'objectName') and widget.objectName() == "key_combo_display":
                widget.setStyleSheet(f'''
                    font-size: 15px;
                    color: {self.theme_manager.get_color('text_secondary')};
                    font-weight: 400;
                    margin-top: 2px;
                    letter-spacing: 0.1px;
                ''')

        # Update key pills
        if hasattr(self, 'key_pills'):
            for pill in self.key_pills:
                pill.setStyleSheet(f'''
                    QLabel {{
                        background: {self.theme_manager.get_color('onboarding.shadow')};
                        color: {self.theme_manager.get_color('text_primary')};
                        border-radius: 12px;
                        padding: 8px 18px;
                        font-size: 22px;
                        font-weight: 500;
                        min-width: 38px;
                        margin: 0 2px;
                    }}
                ''')

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
        self.logo_label = QLabel()
        self.logo_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.update_logo_pixmap()
        content_layout.addWidget(self.logo_label)

        # Title
        title_label = QLabel("Welcome to Inten")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet(f'''
            font-size: 36px;
            font-weight: 700;
            color: {self.theme_manager.get_color('text_primary')};
            margin-top: 0px;
            margin-bottom: 6px;
            letter-spacing: -0.5px;
        ''')
        content_layout.addWidget(title_label)

        # Subtitle
        desc_label = QLabel("Let's set up your permissions to get started.")
        desc_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        desc_label.setStyleSheet(f'''
            font-size: 18px;
            color: {self.theme_manager.get_color('text_secondary')};
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

    def update_logo_pixmap(self):
        logo_path = self.theme_manager.get_logo_path()
        if logo_path:
            logo_pixmap = QPixmap(logo_path)
            if not logo_pixmap.isNull():
                scaled_pixmap = logo_pixmap.scaled(140, 140, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
                self.logo_label.setPixmap(scaled_pixmap)
                self.logo_label.setText("")
                return
        # Fallback
        self.logo_label.setPixmap(QPixmap())
        self.logo_label.setText("🎯")
        self.logo_label.setStyleSheet("font-size: 80px; background-color: transparent; margin-bottom: 8px;")

    def show_permission_screen(self):
        self.clear_layout()
        
        # Create permission screen
        self.permission_screen = PermissionScreen(self.theme_manager, self.permission_checker)
        self.permission_screen.permission_states = self.permission_states
        
        # Create the screen and get the buttons
        mic_button, acc_button, continue_button = self.permission_screen.create(self.layout)
        
        # Connect button signals
        mic_button.clicked.connect(self.permission_screen.request_microphone_permission)
        acc_button.clicked.connect(self.permission_screen.request_accessibility_permission)
        continue_button.clicked.connect(self.check_all_permissions_and_proceed)
        
        # Connect permission checker signal
        self.permission_checker.permission_checked.connect(self.permission_screen.handle_permission_check)

    def check_all_permissions_and_proceed(self):
        """Checks if all permissions are granted and proceeds to keyboard setup screen."""
        if all(self.permission_states.values()):
            self.show_keyboard_setup_screen()
        else:
            # Show error message
            error_label = QLabel("Please grant all required permissions to continue")
            error_label.setStyleSheet(f"color: {self.theme_manager.get_color('error')};")
            self.layout.addWidget(error_label)

    def show_keyboard_setup_screen(self):
        self.clear_layout()

        # --- Centered Layout ---
        content_layout = QVBoxLayout()
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.setSpacing(40)

        # Title
        title_label = QLabel("Set Up Your Keyboard Shortcut")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet(f'''
            font-size: 34px;
            font-weight: 600;
            color: {self.theme_manager.get_color('text_primary')};
            margin-top: 0px;
            margin-bottom: 8px;
            letter-spacing: -0.5px;
        ''')
        content_layout.addWidget(title_label)

        # Description
        desc_label = QLabel("Press any key or key combination to set your shortcut")
        desc_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        desc_label.setStyleSheet(f'''
            font-size: 16px;
            color: {self.theme_manager.get_color('text_secondary')};
            font-weight: 400;
            margin-bottom: 10px;
            letter-spacing: 0.05px;
        ''')
        content_layout.addWidget(desc_label)

        # Keyboard display container (modern card style)
        keyboard_container = QWidget()
        keyboard_container.setObjectName("keyboard_container")
        keyboard_container.setFixedSize(420, 140)
        keyboard_container.setStyleSheet(f'''
            background: {self.theme_manager.get_color('surface')};
            border-radius: 22px;
        ''')
        keyboard_layout = QVBoxLayout(keyboard_container)
        keyboard_layout.setContentsMargins(28, 24, 28, 24)
        keyboard_layout.setSpacing(12)

        # Key pill display area
        self.key_pill_container = QWidget()
        self.key_pill_layout = QHBoxLayout(self.key_pill_container)
        self.key_pill_layout.setContentsMargins(0, 0, 0, 0)
        self.key_pill_layout.setSpacing(12)
        self.key_pill_layout.addStretch()
        self.key_pills = []
        self.update_key_pills([])  # Start empty
        self.key_pill_layout.addStretch()
        keyboard_layout.addWidget(self.key_pill_container, alignment=Qt.AlignmentFlag.AlignCenter)

        # Key combination display (instructions)
        self.key_combo_display = QLabel("Press any key…")
        self.key_combo_display.setObjectName("key_combo_display")
        self.key_combo_display.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.key_combo_display.setStyleSheet(f'''
            font-size: 15px;
            color: {self.theme_manager.get_color('text_secondary')};
            font-weight: 400;
            margin-top: 2px;
            letter-spacing: 0.1px;
        ''')
        keyboard_layout.addWidget(self.key_combo_display)

        content_layout.addWidget(keyboard_container, alignment=Qt.AlignmentFlag.AlignCenter)
        content_layout.addSpacing(16)

        # Continue Button
        self.continue_button = QPushButton("Continue")
        self.continue_button.setObjectName("onboarding-primary")
        self.continue_button.clicked.connect(self.complete_keyboard_setup)
        self.continue_button.setEnabled(False)
        self.continue_button.setFixedWidth(220)
        self.continue_button.setFixedHeight(48)
        content_layout.addWidget(self.continue_button, alignment=Qt.AlignmentFlag.AlignCenter)

        # --- Center the content in the main layout ---
        self.layout.addStretch(2)
        self.layout.addLayout(content_layout)
        self.layout.addStretch(3)

        # Start listening for keyboard input
        self.start_keyboard_listening()

    def update_key_pills(self, keys):
        # Remove old pills
        for pill in getattr(self, 'key_pills', []):
            self.key_pill_layout.removeWidget(pill)
            pill.deleteLater()
        self.key_pills = []
        # Add new pills
        for key in keys:
            # Convert key object to symbol/string
            key_str = self.keyboard_manager.get_key_symbol(key)
            pill = QLabel(key_str)
            pill.setAlignment(Qt.AlignmentFlag.AlignCenter)
            pill.setStyleSheet(f'''
                QLabel {{
                    background: {self.theme_manager.get_color('onboarding.shadow')};;
                    color: {self.theme_manager.get_color('text_primary')};
                    border-radius: 12px;
                    padding: 8px 18px;
                    font-size: 22px;
                    font-weight: 500;
                    min-width: 38px;
                    margin: 0 2px;
                }}
            ''')
            self.key_pill_layout.insertWidget(self.key_pill_layout.count() - 1, pill)
            self.key_pills.append(pill)

    def start_keyboard_listening(self):
        self.is_recording_hotkey = True
        self.current_hotkey = None
        self.update_key_pills([])
        self.key_combo_display.setText("Press any key…")
        self.continue_button.setEnabled(False)
        # Start polling for pressed keys
        self.keyboard_poll_timer = QTimer(self)
        self.keyboard_poll_timer.timeout.connect(self.poll_pressed_keys)
        self.keyboard_poll_timer.start(50)
        
        # Add hold timer
        self.hold_timer = QTimer(self)
        self.hold_timer.setSingleShot(True)
        self.hold_timer.timeout.connect(self.on_hold_complete)
        self._last_pressed_keys = None
        self._hold_start_time = None

    def poll_pressed_keys(self):
        if not self.is_recording_hotkey:
            return
        pressed_keys = KeyboardManager.instance().get_pressed_keys()
        # Convert to symbols/strings for display and hotkey string
        key_symbols = [self.keyboard_manager.get_key_symbol(k) for k in pressed_keys]
        
        if len(key_symbols) > 0:
            # If keys changed, reset hold timer
            if getattr(self, '_last_pressed_keys', None) != key_symbols:
                self._last_pressed_keys = key_symbols
                self._hold_start_time = None
                self.hold_timer.stop()
                self.update_key_pills(pressed_keys)
                self.current_hotkey = "+".join(key_symbols)
                self.key_combo_display.setText("Hold keys for 2 seconds to lock in...")
                self.continue_button.setEnabled(False)
            # If keys are the same and we haven't started the hold timer
            elif self._hold_start_time is None:
                self._hold_start_time = QTimer.singleShot(2000, self.on_hold_complete)
        else:
            # If no keys are pressed and we haven't locked in a combination
            if not self.continue_button.isEnabled():
                self._last_pressed_keys = None
                self._hold_start_time = None
                self.hold_timer.stop()
                self.update_key_pills([])
                self.current_hotkey = None
                self.key_combo_display.setText("Press any key…")
                self.continue_button.setEnabled(False)

    def on_hold_complete(self):
        """Called when user has held the same keys for 2 seconds"""
        if self._last_pressed_keys:
            self.key_combo_display.setText("Press any other key to change")
            self.continue_button.setEnabled(True)

    def complete_keyboard_setup(self):
        if hasattr(self, 'keyboard_poll_timer'):
            self.keyboard_poll_timer.stop()
        if self.current_hotkey:
            self.settings.setValue("Hotkeys/start_recording_hotkey", self.current_hotkey)
            self.settings.sync()
            self.keyboard_manager.set_hotkey(self.current_hotkey)
            self.is_recording_hotkey = False
            self.show_completion_screen()

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
        check_icon.setStyleSheet(f'''
            QLabel {{
                background-color: {self.theme_manager.get_color('onboarding.success.background')};
                color: {self.theme_manager.get_color('onboarding.success.text')};
                font-size: 32px;
                border-radius: 28px;
                margin-bottom: 4px;
                font-weight: 500;
                letter-spacing: 1px;
            }}
        ''')
        icon_layout.addWidget(check_icon)
        content_layout.addWidget(icon_container)
        content_layout.addSpacing(8)

        # Title
        title_label = QLabel("Setup Complete!")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet(f'''
            font-size: 28px;
            font-weight: 600;
            color: {self.theme_manager.get_color('text_primary')};
            margin-top: 0px;
            margin-bottom: 6px;
            letter-spacing: -0.3px;
        ''')
        content_layout.addWidget(title_label)

        # Subtitle
        desc_label = QLabel("You're all set to start using Inten!")
        desc_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        desc_label.setStyleSheet(f'''
            font-size: 16px;
            color: {self.theme_manager.get_color('text_secondary')};
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
        self.home_window = HomeWindow(theme_manager=self.theme_manager)
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
    theme_manager = ThemeManager.instance()
    onboarding_window = OnboardingWindow(theme_manager=theme_manager)
    onboarding_window.show()
    sys.exit(app.exec())
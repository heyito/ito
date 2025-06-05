import logging
import os
import platform

from PySide6.QtCore import QEasingCurve, QPropertyAnimation, Qt, QTimer
from PySide6.QtWidgets import (
    QGraphicsOpacityEffect,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QProgressBar,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from src.ui.theme.manager import ThemeManager
from src.utils.permission_checker import PermissionChecker

# Configure logging
logger = logging.getLogger(__name__)


class PermissionScreen:
    def __init__(
        self, theme_manager: ThemeManager, permission_checker: PermissionChecker
    ):
        self.theme_manager = theme_manager
        self.permission_checker = permission_checker
        self.mic_status = None
        self.acc_status = None
        self.screen_status = None
        self.progress_bar = None
        self.continue_button = None
        self.permission_states = {
            "microphone": False,
            "accessibility": False,
            "screen_recording": False,
        }
        self._is_cleaned_up = False
        self._animation_refs = []  # Store animation references

        # Store references to widgets that need style updates
        self.title_label = None
        self.desc_label = None
        self.mic_button = None
        self.acc_button = None
        self.screen_button = None
        self.continue_button = None
        self.mic_status = None
        self.acc_status = None
        self.screen_status = None
        self.content_widget = None  # Store reference to content widget

        # Connect theme changes
        self.theme_manager.theme_changed.connect(self.update_styles)

    def update_styles(self):
        """Update all styles based on current theme"""
        if self._is_cleaned_up:
            return

        if self.title_label:
            self.title_label.setStyleSheet(f"""
                font-size: 28px;
                font-weight: 600;
                color: {self.theme_manager.get_color("text_primary")};
                margin-top: 0px;
                margin-bottom: 6px;
                letter-spacing: -0.5px;
            """)

        if self.desc_label:
            self.desc_label.setStyleSheet(f"""
                font-size: 15px;
                color: {self.theme_manager.get_color("text_secondary")};
                font-weight: 400;
                margin-bottom: 40px;
                letter-spacing: 0.1px;
            """)

        if self.mic_status:
            is_granted = self.permission_states.get("microphone", False)
            self.mic_status.setStyleSheet(
                f"color: {self.theme_manager.get_color('text_primary')};"
                if is_granted
                else f"color: {self.theme_manager.get_color('text_secondary')};"
            )

        if self.acc_status:
            is_granted = self.permission_states.get("accessibility", False)
            self.acc_status.setStyleSheet(
                f"color: {self.theme_manager.get_color('text_primary')};"
                if is_granted
                else f"color: {self.theme_manager.get_color('text_secondary')};"
            )

        if self.screen_status:
            is_granted = self.permission_states.get("screen_recording", False)
            self.screen_status.setStyleSheet(
                f"color: {self.theme_manager.get_color('text_primary')};"
                if is_granted
                else f"color: {self.theme_manager.get_color('text_secondary')};"
            )

    def create(self, parent_layout):
        # Create a container widget for all content
        self.content_widget = QWidget()
        content_layout = QVBoxLayout(self.content_widget)
        content_layout.setContentsMargins(12, 12, 12, 12)
        content_layout.setSpacing(0)

        # Store the layout reference
        self.layout = content_layout

        # Title
        self.title_label = QLabel("Required Permissions")
        self.title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        content_layout.addWidget(self.title_label)

        # Description
        self.desc_label = QLabel(
            "Ito needs a few permissions to help you be more productive. You may have to restart Ito after granting permissions."
        )
        self.desc_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        content_layout.addWidget(self.desc_label)

        # Progress Bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 3)  # Updated for 3 permissions
        self.progress_bar.setValue(0)
        self.progress_bar.setTextVisible(False)
        self.progress_bar.setFixedWidth(200)
        content_layout.addWidget(
            self.progress_bar, alignment=Qt.AlignmentFlag.AlignCenter
        )

        # Spacer
        content_layout.addSpacing(12)

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
        mic_text.setStyleSheet(
            f"color: {self.theme_manager.get_color('text_primary')};"
        )
        mic_layout.addWidget(mic_text)

        mic_layout.addStretch()

        # Start status as "Checking..."
        self.mic_status = QLabel("Checking...")
        self.mic_status.setObjectName("permission_status")
        self.mic_status.setStyleSheet(
            f"color: {self.theme_manager.get_color('text_secondary')};"
        )
        mic_layout.addWidget(self.mic_status)

        self.mic_button = QPushButton("Grant Access")
        self.mic_button.setObjectName("onboarding-primary")
        mic_layout.addWidget(self.mic_button)

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
        acc_text.setStyleSheet(
            f"color: {self.theme_manager.get_color('text_primary')};"
        )
        acc_layout.addWidget(acc_text)

        acc_layout.addStretch()

        # Start status as "Checking..."
        self.acc_status = QLabel("Checking...")
        self.acc_status.setObjectName("permission_status")
        self.acc_status.setStyleSheet(
            f"color: {self.theme_manager.get_color('text_secondary')};"
        )
        acc_layout.addWidget(self.acc_status)

        self.acc_button = QPushButton("Grant Access")
        self.acc_button.setObjectName("onboarding-primary")
        acc_layout.addWidget(self.acc_button)

        permissions_layout.addWidget(acc_container)

        # Screen Recording Permission
        screen_container = QWidget()
        screen_container.setObjectName("permission_row")
        screen_layout = QHBoxLayout(screen_container)
        screen_layout.setContentsMargins(0, 0, 16, 0)

        screen_icon = QLabel("🖥️")
        screen_icon.setObjectName("permission_icon")
        screen_layout.addWidget(screen_icon)

        screen_text = QLabel("Screen Recording")
        screen_text.setObjectName("permission_text")
        screen_text.setStyleSheet(
            f"color: {self.theme_manager.get_color('text_primary')};"
        )
        screen_layout.addWidget(screen_text)

        screen_layout.addStretch()

        # Start status as "Checking..."
        self.screen_status = QLabel("Checking...")
        self.screen_status.setObjectName("permission_status")
        self.screen_status.setStyleSheet(
            f"color: {self.theme_manager.get_color('text_secondary')};"
        )
        screen_layout.addWidget(self.screen_status)

        self.screen_button = QPushButton("Grant Access")
        self.screen_button.setObjectName("onboarding-primary")
        screen_layout.addWidget(self.screen_button)

        permissions_layout.addWidget(screen_container)

        # Add permissions container to main layout
        content_layout.addWidget(permissions_container)

        # Add spacing before the Continue button
        content_layout.addSpacing(10)

        # Continue Button
        self.continue_button = QPushButton("Check Permissions")
        self.continue_button.setObjectName("onboarding-primary")
        self.continue_button.setEnabled(True)
        self.continue_button.setFixedWidth(200)
        content_layout.addWidget(
            self.continue_button, alignment=Qt.AlignmentFlag.AlignCenter
        )

        # Add the content widget to the parent layout
        parent_layout.addWidget(self.content_widget)

        # Initial permission check with delay
        QTimer.singleShot(500, self._check_all_permissions)

        # Apply initial styles
        self.update_styles()

        # Start fade-in animation
        opacity_effect = QGraphicsOpacityEffect(self.content_widget)
        self.content_widget.setGraphicsEffect(opacity_effect)
        opacity_anim = QPropertyAnimation(opacity_effect, b"opacity")
        opacity_anim.setDuration(800)
        opacity_anim.setStartValue(0)
        opacity_anim.setEndValue(1)
        opacity_anim.setEasingCurve(QEasingCurve.OutCubic)
        opacity_anim.start(QPropertyAnimation.DeleteWhenStopped)
        self._animation_refs.append(opacity_anim)

        return (
            self.mic_button,
            self.acc_button,
            self.screen_button,
            self.continue_button,
        )

    def _check_all_permissions(self):
        """Check all permissions sequentially, only proceeding after each is granted"""
        if self._is_cleaned_up:
            return

        # Start with the first permission
        self._check_next_permission(0)

    def _check_next_permission(self, index):
        """Check the next permission in sequence"""
        if self._is_cleaned_up:
            return

        # Define the order of permissions to check
        permissions = [
            ("microphone", self.permission_checker.check_microphone),
            ("accessibility", self.permission_checker.check_accessibility),
            ("screen_recording", self.permission_checker.check_screen_recording),
        ]

        if index >= len(permissions):
            # All permissions have been checked
            return

        permission_name, check_func = permissions[index]

        # Check the current permission
        check_func()

        # Set up a timer to check if the permission was granted
        def check_permission_status():
            if self._is_cleaned_up:
                return

            if self.permission_states[permission_name]:
                # Permission granted, move to next permission
                self._check_next_permission(index + 1)
            else:
                # Permission not granted, check again after a delay
                QTimer.singleShot(1000, check_permission_status)

        # Start checking the permission status
        QTimer.singleShot(1000, check_permission_status)

    def update_progress(self):
        """Updates the progress bar based on granted permissions."""
        granted_count = sum(1 for granted in self.permission_states.values() if granted)
        if self.progress_bar:
            self.progress_bar.setValue(granted_count)

    def handle_permission_check(self, permission, is_granted):
        """Handle permission check results"""
        if self._is_cleaned_up:
            return

        # If the permission state has changed
        if self.permission_states[permission] != is_granted:
            self.permission_states[permission] = is_granted

            if permission == "microphone":
                self.mic_status.setText("Granted" if is_granted else "Not Granted")
            elif permission == "accessibility":
                self.acc_status.setText("Granted" if is_granted else "Not Granted")
            elif permission == "screen_recording":
                self.screen_status.setText("Granted" if is_granted else "Not Granted")

            self.update_progress()

            # Update continue button text and behavior based on all permissions
            if all(self.permission_states.values()):
                self.continue_button.setText("Continue")
                self.continue_button.clicked.disconnect()
                self.continue_button.clicked.connect(
                    self.check_all_permissions_and_proceed
                )
            else:
                self.continue_button.setText("Check Permissions")
                self.continue_button.clicked.disconnect()
                self.continue_button.clicked.connect(self._check_all_permissions)

            # Apply styles
            self.update_styles()

    def request_microphone_permission(self):
        """Request microphone permission"""
        if self._is_cleaned_up:
            return

        if platform.system() == "Darwin":
            os.system(
                'open "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"'
            )
            QTimer.singleShot(3000, self.permission_checker.check_microphone)
        else:
            logger.info("Please grant microphone access in your system settings")

    def request_accessibility_permission(self):
        """Request accessibility permission"""
        if self._is_cleaned_up:
            return

        if platform.system() == "Darwin":
            os.system(
                'open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"'
            )
            QTimer.singleShot(3000, self.permission_checker.check_accessibility)
        else:
            logger.info("Please grant accessibility access in your system settings")

    def request_screen_recording_permission(self):
        """Request screen recording permission"""
        if self._is_cleaned_up:
            return

        if platform.system() == "Darwin":
            os.system(
                'open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"'
            )
            QTimer.singleShot(3000, self.permission_checker.check_screen_recording)
        else:
            logger.info("Please grant screen recording access in your system settings")

    def check_all_permissions_and_proceed(self):
        """Check all permissions and proceed if all are granted"""
        if all(self.permission_states.values()):
            # Get the parent window and call show_api_setup_screen
            parent_window = self.continue_button.window()
            parent_window.show_api_setup_screen()
        else:
            # Show error message
            error_label = QLabel("Please grant all required permissions to continue")
            error_label.setStyleSheet(
                f"color: {self.theme_manager.get_color('error')};"
            )
            self.layout.addWidget(error_label)

    def find_parent_window(self):
        """Find the parent OnboardingWindow instance"""
        # Get the first widget in the layout
        if not hasattr(self, "layout"):
            return None

        for i in range(self.layout.count()):
            item = self.layout.itemAt(i)
            if item and item.widget():
                widget = item.widget()
                # Walk up the widget hierarchy to find the main window
                while widget:
                    if isinstance(widget, QMainWindow):
                        return widget
                    widget = widget.parent()
        return None

    def cleanup(self):
        """Clean up resources"""
        self._is_cleaned_up = True

        # Clear animation references
        self._animation_refs.clear()

        # Clear references to widgets
        self.title_label = None
        self.desc_label = None
        self.mic_button = None
        self.acc_button = None
        self.screen_button = None
        self.continue_button = None
        self.mic_status = None
        self.acc_status = None
        self.screen_status = None
        self.content_widget = None

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

from src.ui.permission_checker import PermissionChecker
from src.ui.theme.manager import ThemeManager

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
        self.input_mon_status = None
        self.progress_bar = None
        self.continue_button = None
        self.permission_states = {
            "microphone": False,
            "accessibility": False,
            "input_monitoring": False,
        }
        self._is_cleaned_up = False
        self._animation_refs = []  # Store animation references

        # Store references to widgets that need style updates
        self.title_label = None
        self.desc_label = None
        self.mic_button = None
        self.acc_button = None
        self.input_mon_button = None
        self.continue_button = None
        self.mic_status = None
        self.acc_status = None
        self.input_mon_status = None
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

        if self.input_mon_status:
            is_granted = self.permission_states.get("input_monitoring", False)
            self.input_mon_status.setStyleSheet(
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
            "Ito needs a few permissions to help you be more productive"
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
        content_layout.addSpacing(30)

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

        # Input Monitoring Permission
        input_mon_container = QWidget()
        input_mon_container.setObjectName("permission_row")
        input_mon_layout = QHBoxLayout(input_mon_container)
        input_mon_layout.setContentsMargins(0, 0, 16, 0)

        input_mon_icon = QLabel("👀")
        input_mon_icon.setObjectName("permission_icon")
        input_mon_layout.addWidget(input_mon_icon)

        input_mon_text = QLabel("Input Monitoring")
        input_mon_text.setObjectName("permission_text")
        input_mon_text.setStyleSheet(
            f"color: {self.theme_manager.get_color('text_primary')};"
        )
        input_mon_layout.addWidget(input_mon_text)

        input_mon_layout.addStretch()

        # Start status as "Checking..."
        self.input_mon_status = QLabel("Checking...")
        self.input_mon_status.setObjectName("permission_status")
        self.input_mon_status.setStyleSheet(
            f"color: {self.theme_manager.get_color('text_secondary')};"
        )
        input_mon_layout.addWidget(self.input_mon_status)

        self.input_mon_button = QPushButton("Grant Access")
        self.input_mon_button.setObjectName("onboarding-primary")
        input_mon_layout.addWidget(self.input_mon_button)

        permissions_layout.addWidget(input_mon_container)

        # Add permissions container to main layout
        content_layout.addWidget(permissions_container)

        # Add spacing before the Continue button
        content_layout.addSpacing(40)

        # Continue Button
        self.continue_button = QPushButton("Continue")
        self.continue_button.setObjectName("onboarding-primary")
        self.continue_button.setEnabled(False)
        self.continue_button.setFixedWidth(200)
        content_layout.addWidget(
            self.continue_button, alignment=Qt.AlignmentFlag.AlignCenter
        )

        # Add the content widget to the parent layout
        parent_layout.addWidget(self.content_widget)

        # Start checking permissions
        self.update_progress()  # Initial progress
        QTimer.singleShot(100, self.permission_checker.check_microphone)
        QTimer.singleShot(200, self.permission_checker.check_accessibility)
        QTimer.singleShot(300, self.permission_checker.check_input_monitoring)

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
            self.input_mon_button,
            self.continue_button,
        )

    def update_progress(self):
        """Updates the progress bar based on granted permissions."""
        granted_count = sum(1 for granted in self.permission_states.values() if granted)
        if self.progress_bar:
            self.progress_bar.setValue(granted_count)

    def handle_permission_check(self, permission, is_granted):
        """Handle permission check results"""
        if self._is_cleaned_up:
            return

        self.permission_states[permission] = is_granted

        if permission == "microphone":
            self.mic_status.setText("Granted" if is_granted else "Not Granted")
        elif permission == "accessibility":
            self.acc_status.setText("Granted" if is_granted else "Not Granted")
        elif permission == "input_monitoring":
            self.input_mon_status.setText("Granted" if is_granted else "Not Granted")

        self.update_progress()

        # Enable continue button if all permissions are granted
        self.continue_button.setEnabled(all(self.permission_states.values()))

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

    def request_input_monitoring_permission(self):
        """Request input monitoring permission"""
        if self._is_cleaned_up:
            return

        if platform.system() == "Darwin":
            os.system(
                'open "x-apple.systempreferences:com.apple.preference.security?Privacy_InputMonitoring"'
            )
            QTimer.singleShot(3000, self.permission_checker.check_input_monitoring)
        else:
            logger.info("Please grant input monitoring access in your system settings")

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
        self.input_mon_button = None
        self.continue_button = None
        self.mic_status = None
        self.acc_status = None
        self.input_mon_status = None
        self.content_widget = None

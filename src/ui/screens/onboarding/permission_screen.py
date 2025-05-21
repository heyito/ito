from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QProgressBar,
    QPushButton,
    QWidget,
)
import platform
import os

class PermissionScreen:
    def __init__(self, theme_manager, permission_checker):
        self.theme_manager = theme_manager
        self.permission_checker = permission_checker
        self.mic_status = None
        self.acc_status = None
        self.progress_bar = None
        self.continue_button = None
        self.permission_states = {
            'microphone': False,
            'accessibility': False
        }

    def create(self, parent_layout):
        # Title
        title_label = QLabel("Required Permissions")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet(f"""
            font-size: 28px; 
            font-weight: 600; 
            color: {self.theme_manager.get_color('text_primary')};
            margin-top: 40px; 
            margin-bottom: 8px;
            letter-spacing: -0.5px;
        """)
        parent_layout.addWidget(title_label)

        # Description
        desc_label = QLabel("Inten needs a few permissions to help you be more productive")
        desc_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        desc_label.setStyleSheet(f"""
            font-size: 15px; 
            color: {self.theme_manager.get_color('text_secondary')};
            margin-bottom: 40px;
        """)
        parent_layout.addWidget(desc_label)

        # Progress Bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 2)
        self.progress_bar.setValue(0)
        self.progress_bar.setTextVisible(False)
        self.progress_bar.setFixedWidth(200)
        parent_layout.addWidget(self.progress_bar, alignment=Qt.AlignmentFlag.AlignCenter)

        # Spacer
        parent_layout.addSpacing(30)

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
        mic_text.setStyleSheet(f"color: {self.theme_manager.get_color('text_primary')};")
        mic_layout.addWidget(mic_text)
        
        mic_layout.addStretch()
        
        # Start status as "Checking..."
        self.mic_status = QLabel("Checking...")
        self.mic_status.setObjectName("permission_status")
        self.mic_status.setStyleSheet(f"color: {self.theme_manager.get_color('text_secondary')};")
        mic_layout.addWidget(self.mic_status)
        
        mic_button = QPushButton("Grant Access")
        mic_button.setObjectName("onboarding-primary")
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
        acc_text.setStyleSheet(f"color: {self.theme_manager.get_color('text_primary')};")
        acc_layout.addWidget(acc_text)
        
        acc_layout.addStretch()
        
        # Start status as "Checking..."
        self.acc_status = QLabel("Checking...")
        self.acc_status.setObjectName("permission_status")
        self.acc_status.setStyleSheet(f"color: {self.theme_manager.get_color('text_secondary')};")
        acc_layout.addWidget(self.acc_status)
        
        acc_button = QPushButton("Grant Access")
        acc_button.setObjectName("onboarding-primary")
        acc_layout.addWidget(acc_button)
        
        permissions_layout.addWidget(acc_container)
        
        # Add permissions container to main layout
        parent_layout.addWidget(permissions_container)

        # Add spacing before the Continue button
        parent_layout.addSpacing(40)

        # Continue Button
        self.continue_button = QPushButton("Continue")
        self.continue_button.setObjectName("onboarding-primary")
        self.continue_button.setEnabled(False)
        self.continue_button.setFixedWidth(200)
        parent_layout.addWidget(self.continue_button, alignment=Qt.AlignmentFlag.AlignCenter)

        # Add stretch after the button to push it up from the bottom
        parent_layout.addStretch()

        # Start checking permissions
        self.update_progress()  # Initial progress
        QTimer.singleShot(100, self.permission_checker.check_microphone)
        QTimer.singleShot(200, self.permission_checker.check_accessibility)

        return mic_button, acc_button, self.continue_button

    def update_progress(self):
        """Updates the progress bar based on granted permissions."""
        granted_count = sum(1 for granted in self.permission_states.values() if granted)
        if self.progress_bar:
            self.progress_bar.setValue(granted_count)

    def handle_permission_check(self, permission, is_granted):
        """Handle permission check results"""
        self.permission_states[permission] = is_granted

        if permission == 'microphone':
            self.mic_status.setText("Granted" if is_granted else "Not Granted")
            self.mic_status.setStyleSheet(f"color: {self.theme_manager.get_color('success')};" if is_granted else f"color: {self.theme_manager.get_color('error')};")
        elif permission == 'accessibility':
            self.acc_status.setText("Granted" if is_granted else "Not Granted")
            self.acc_status.setStyleSheet(f"color: {self.theme_manager.get_color('success')};" if is_granted else f"color: {self.theme_manager.get_color('error')};")
        
        self.update_progress()
        
        # Enable continue button if all permissions are granted
        self.continue_button.setEnabled(all(self.permission_states.values()))

    def request_microphone_permission(self):
        """Request microphone permission"""
        if platform.system() == 'Darwin':
            os.system('open "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"')
            QTimer.singleShot(3000, self.permission_checker.check_microphone)
        else:
            print("Please grant microphone access in your system settings")

    def request_accessibility_permission(self):
        """Request accessibility permission"""
        if platform.system() == 'Darwin':
            os.system('open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"')
            QTimer.singleShot(3000, self.permission_checker.check_accessibility)
        else:
            print("Please grant accessibility access in your system settings") 
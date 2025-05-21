from PySide6.QtCore import Qt
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import (
    QVBoxLayout,
    QLabel,
    QPushButton,
)

class WelcomeScreen:
    def __init__(self, theme_manager):
        self.theme_manager = theme_manager
        self._is_cleaned_up = False
        
        # Store references to widgets that need style updates
        self.logo_label = None
        self.title_label = None
        self.desc_label = None
        self.start_button = None

        # Connect theme changes
        self.theme_manager.theme_changed.connect(self.update_styles)

    def update_styles(self):
        """Update all styles based on current theme"""
        if self._is_cleaned_up:
            return
            
        if self.title_label:
            self.title_label.setStyleSheet(f'''
                font-size: 36px;
                font-weight: 700;
                color: {self.theme_manager.get_color('text_primary')};
                margin-top: 0px;
                margin-bottom: 6px;
                letter-spacing: -0.5px;
            ''')
            
        if self.desc_label:
            self.desc_label.setStyleSheet(f'''
                font-size: 18px;
                color: {self.theme_manager.get_color('text_secondary')};
                font-weight: 400;
                margin-bottom: 24px;
                letter-spacing: 0.1px;
            ''')

        self.update_logo_pixmap()

    def update_logo_pixmap(self):
        """Update the logo based on current theme"""
        if self._is_cleaned_up or not self.logo_label:
            return
            
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

    def create(self, parent_layout):
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
        self.title_label = QLabel("Welcome to Inten")
        self.title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        content_layout.addWidget(self.title_label)

        # Subtitle
        self.desc_label = QLabel("Let's set up your permissions to get started.")
        self.desc_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        content_layout.addWidget(self.desc_label)

        # Get Started Button
        self.start_button = QPushButton("Get Started")
        self.start_button.setObjectName("onboarding-primary")
        self.start_button.setFixedHeight(44)
        self.start_button.setMinimumWidth(180)
        content_layout.addSpacing(8)
        content_layout.addWidget(self.start_button, alignment=Qt.AlignmentFlag.AlignCenter)

        # --- Center the content in the main layout ---
        parent_layout.addStretch(2)
        parent_layout.addLayout(content_layout)
        parent_layout.addStretch(3)

        # Apply initial styles
        self.update_styles()

        return self.start_button

    def cleanup(self):
        """Clean up resources"""
        self._is_cleaned_up = True
        
        # Clear references to widgets
        self.logo_label = None
        self.title_label = None
        self.desc_label = None
        self.start_button = None 
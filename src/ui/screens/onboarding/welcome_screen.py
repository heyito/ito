from PySide6.QtCore import QEasingCurve, QPoint, QPropertyAnimation, Qt, QTimer
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import (
    QGraphicsOpacityEffect,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
)


class WelcomeScreen:
    def __init__(self, theme_manager):
        self.theme_manager = theme_manager
        self._is_cleaned_up = False
        self._animation_refs = []  # Prevent GC

        # Store references to widgets that need style updates
        self.logo_label = None
        self.title_label = None
        self.desc_label = None
        self.start_button = None
        self.content_widget = None

        # Connect theme changes
        self.theme_manager.theme_changed.connect(self.update_styles)

    def update_styles(self):
        """Update all styles based on current theme"""
        if self._is_cleaned_up:
            return

        if self.title_label:
            self.title_label.setStyleSheet(f"""
                font-size: 36px;
                font-weight: 700;
                color: {self.theme_manager.get_color("text_primary")};
                margin-top: 0px;
                margin-bottom: 6px;
                letter-spacing: -0.5px;
            """)

        if self.desc_label:
            self.desc_label.setStyleSheet(f"""
                font-size: 18px;
                color: {self.theme_manager.get_color("text_secondary")};
                font-weight: 400;
                margin-bottom: 24px;
                letter-spacing: 0.1px;
            """)

        self.update_logo_pixmap()

    def update_logo_pixmap(self):
        """Update the logo based on current theme"""
        if self._is_cleaned_up or not self.logo_label:
            return

        logo_path = self.theme_manager.get_logo_path()
        if logo_path:
            logo_pixmap = QPixmap(logo_path)
            if not logo_pixmap.isNull():
                scaled_pixmap = logo_pixmap.scaled(
                    140,
                    140,
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation,
                )
                self.logo_label.setPixmap(scaled_pixmap)
                self.logo_label.setText("")
                return
        # Fallback
        self.logo_label.setPixmap(QPixmap())
        self.logo_label.setText("🎯")
        self.logo_label.setStyleSheet(
            "font-size: 80px; background-color: transparent; margin-bottom: 8px;"
        )

    def create(self, parent_layout):
        # --- Centered Layout ---
        content_layout = QVBoxLayout()
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.setSpacing(36)

        # Create a container widget for the content
        self.content_widget = QWidget()
        self.content_widget.setLayout(content_layout)

        # Logo
        self.logo_label = QLabel()
        self.logo_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.update_logo_pixmap()
        content_layout.addWidget(self.logo_label)

        # Title
        self.title_label = QLabel("Welcome to Ito")
        self.title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        content_layout.addWidget(self.title_label)

        # Subtitle
        self.desc_label = QLabel("Let's set up your permissions to get started.")
        self.desc_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        content_layout.addWidget(self.desc_label)

        # Create a container for the button to ensure proper spacing
        button_container = QWidget()
        button_container.setFixedHeight(100)  # Ensure enough space for animation
        button_layout = QVBoxLayout(button_container)
        button_layout.setContentsMargins(0, 0, 0, 0)
        button_layout.setSpacing(0)

        # Get Started Button
        self.start_button = QPushButton("Get Started")
        self.start_button.setObjectName("onboarding-primary")
        self.start_button.setFixedHeight(44)
        self.start_button.setMinimumWidth(180)
        button_layout.addWidget(
            self.start_button, alignment=Qt.AlignmentFlag.AlignCenter
        )

        content_layout.addWidget(button_container)

        # --- Center the content in the main layout ---
        parent_layout.addStretch(2)
        parent_layout.addWidget(self.content_widget)
        parent_layout.addStretch(3)

        # Apply initial styles
        self.update_styles()

        def start_animations():
            # Fade in the whole content
            opacity_effect = QGraphicsOpacityEffect(self.content_widget)
            self.content_widget.setGraphicsEffect(opacity_effect)
            opacity_anim = QPropertyAnimation(opacity_effect, b"opacity")
            opacity_anim.setDuration(800)
            opacity_anim.setStartValue(0)
            opacity_anim.setEndValue(1)
            opacity_anim.setEasingCurve(QEasingCurve.OutCubic)
            opacity_anim.start(QPropertyAnimation.DeleteWhenStopped)
            self._animation_refs.append(opacity_anim)

            # Slide down the content (logo, title, description)
            content_start = self.content_widget.pos() - QPoint(0, 60)
            content_end = self.content_widget.pos()
            self.content_widget.move(content_start)
            content_anim = QPropertyAnimation(self.content_widget, b"pos")
            content_anim.setDuration(1000)
            content_anim.setStartValue(content_start)
            content_anim.setEndValue(content_end)
            content_anim.setEasingCurve(QEasingCurve.OutCubic)
            content_anim.start(QPropertyAnimation.DeleteWhenStopped)
            self._animation_refs.append(content_anim)

        QTimer.singleShot(0, start_animations)

        return self.start_button

    def cleanup(self):
        """Clean up resources"""
        self._is_cleaned_up = True

        # Clear references to widgets
        self.logo_label = None
        self.title_label = None
        self.desc_label = None
        self.start_button = None
        self.content_widget = None
        self._animation_refs = []

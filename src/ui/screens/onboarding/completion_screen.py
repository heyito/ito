from PySide6.QtCore import Qt, QPropertyAnimation, QEasingCurve, QPoint, QTimer
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
    QGraphicsOpacityEffect,
)


class CompletionScreen:
    def __init__(self, theme_manager):
        self.theme_manager = theme_manager
        self._is_cleaned_up = False
        self._animation_refs = []  # Prevent GC

        # Store references to widgets that need style updates
        self.check_icon = None
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

        if self.check_icon:
            self.check_icon.setStyleSheet(f"""
                QLabel {{
                    background-color: {self.theme_manager.get_color("onboarding.success.background")};
                    color: {self.theme_manager.get_color("onboarding.success.text")};
                    font-size: 32px;
                    border-radius: 28px;
                    margin-bottom: 4px;
                    font-weight: 500;
                    letter-spacing: 1px;
                }}
            """)

        if self.title_label:
            self.title_label.setStyleSheet(f"""
                font-size: 28px;
                font-weight: 600;
                color: {self.theme_manager.get_color("text_primary")};
                margin-top: 0px;
                margin-bottom: 6px;
                letter-spacing: -0.3px;
            """)

        if self.desc_label:
            self.desc_label.setStyleSheet(f"""
                font-size: 16px;
                color: {self.theme_manager.get_color("text_secondary")};
                font-weight: 400;
                margin-bottom: 20px;
                letter-spacing: 0.05px;
            """)

    def create(self, parent_layout):
        # --- Centered Layout ---
        content_layout = QVBoxLayout()
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.setSpacing(28)

        # Create a container widget for the content
        self.content_widget = QWidget()
        self.content_widget.setLayout(content_layout)

        # Centered icon container
        icon_container = QWidget()
        icon_layout = QHBoxLayout(icon_container)
        icon_layout.setContentsMargins(0, 0, 0, 0)
        icon_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # Minimal, soft checkmark icon in a pastel green circle
        self.check_icon = QLabel()
        self.check_icon.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.check_icon.setText("✓")
        self.check_icon.setFixedSize(56, 56)
        icon_layout.addWidget(self.check_icon)
        content_layout.addWidget(icon_container)
        content_layout.addSpacing(8)

        # Title
        self.title_label = QLabel("Setup Complete!")
        self.title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        content_layout.addWidget(self.title_label)

        # Subtitle
        self.desc_label = QLabel("You're all set to start using Inten!")
        self.desc_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        content_layout.addWidget(self.desc_label)
        content_layout.addSpacing(8)

        # Create a container for the button to ensure proper spacing
        button_container = QWidget()
        button_container.setFixedHeight(100)  # Ensure enough space for animation
        button_layout = QVBoxLayout(button_container)
        button_layout.setContentsMargins(0, 0, 0, 0)
        button_layout.setSpacing(0)

        # Start Button
        self.start_button = QPushButton("Start Using Inten")
        self.start_button.setObjectName("onboarding-primary")
        self.start_button.setFixedHeight(38)
        self.start_button.setMinimumWidth(140)
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

            # Slide down the content (icon, title, description)
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
        self.check_icon = None
        self.title_label = None
        self.desc_label = None
        self.start_button = None
        self.content_widget = None
        self._animation_refs = []

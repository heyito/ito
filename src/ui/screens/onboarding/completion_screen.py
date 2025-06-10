from PySide6.QtCore import QEasingCurve, QPoint, QPropertyAnimation, Qt, QTimer, QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (
    QGraphicsOpacityEffect,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
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
        self.left_card = None
        self.right_card = None
        self.install_button = None
        self.gh_button = None
        self.tw_button = None
        self.web_button = None
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
                    color: {self.theme_manager.get_color("text_primary")};
                    font-size: 32px;
                    border-radius: 14px;
                    margin-bottom: 4px;
                    font-weight: 500;
                    letter-spacing: 1px;
                    border: 1px solid {self.theme_manager.get_color("text_primary")};
                    padding: 8px;
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

        card_radius = 16
        card_style = f"""
            QWidget {{
                border-radius: {card_radius}px;
            }}
        """
        if self.left_card:
            self.left_card.setStyleSheet(card_style)
        if self.right_card:
            self.right_card.setStyleSheet(card_style)

        button_style = """
            QPushButton {{
                font-size: 14px;
                font-weight: 500;
                border: none;
                border-radius: 14px;
                padding: 8px 12px;
                min-width: 90px;
            }}
        """
        for btn in [
            self.install_button,
            self.gh_button,
            self.tw_button,
            self.web_button,
        ]:
            if btn:
                btn.setStyleSheet(button_style)

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
        self.title_label = QLabel("You're all set!")
        self.title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        content_layout.addWidget(self.title_label)

        # Subtitle
        self.desc_label = QLabel("Your new voice assistant is ready.")
        self.desc_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        content_layout.addWidget(self.desc_label)
        content_layout.addSpacing(2)

        # --- Two Card Boxes ---
        cards_row = QHBoxLayout()
        cards_row.setSpacing(16)
        cards_row.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # Left Card: Chrome Extension
        self.left_card = QWidget()
        left_layout = QVBoxLayout(self.left_card)
        left_layout.setContentsMargins(28, 24, 28, 24)
        left_layout.setSpacing(12)
        self.left_card.setFixedWidth(400)
        left_title = QLabel("Add the Ito Chrome Extension")
        left_title.setStyleSheet("font-size: 16px; font-weight: 600;")
        left_desc = QLabel(
            "Help make Ito smarter in your browser by adding the Ito extension."
        )
        left_desc.setWordWrap(True)
        left_desc.setStyleSheet(
            f"font-size: 13px; color: {self.theme_manager.get_color('text_primary')};"
        )
        self.install_button = QPushButton("Install")
        self.install_button.clicked.connect(
            lambda: QDesktopServices.openUrl(
                QUrl(
                    "https://chromewebstore.google.com/detail/ito-browser-integration/lmlbndcblagobfpjkkhophkkpnffamln"
                )
            )
        )
        self.install_button.setCursor(Qt.CursorShape.PointingHandCursor)
        left_layout.addWidget(left_title)
        left_layout.addWidget(left_desc)
        left_layout.addSpacing(8)
        left_layout.addWidget(self.install_button, alignment=Qt.AlignmentFlag.AlignLeft)
        left_layout.addStretch(1)

        # Right Card: Open Source Project
        self.right_card = QWidget()
        right_layout = QVBoxLayout(self.right_card)
        right_layout.setContentsMargins(28, 24, 28, 24)
        right_layout.setSpacing(12)
        self.right_card.setFixedWidth(400)
        right_title = QLabel("Follow our Open Source Project")
        right_title.setStyleSheet("font-size: 16px; font-weight: 600;")
        right_desc = QLabel(
            "Stay updated, contribute, or just say hi. We're building in the open."
        )
        right_desc.setWordWrap(True)
        right_desc.setStyleSheet(
            f"font-size: 13px; color: {self.theme_manager.get_color('text_primary')};"
        )
        btn_row = QHBoxLayout()
        btn_row.setSpacing(12)
        self.gh_button = QPushButton("GitHub")
        self.gh_button.clicked.connect(
            lambda: QDesktopServices.openUrl(QUrl("https://github.com/heyito/ito"))
        )
        self.gh_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.tw_button = QPushButton("Twitter (X)")
        self.tw_button.clicked.connect(
            lambda: QDesktopServices.openUrl(QUrl("https://x.com/HeyItoAI"))
        )
        self.tw_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.web_button = QPushButton("Website")
        self.web_button.clicked.connect(
            lambda: QDesktopServices.openUrl(QUrl("https://www.heyito.ai/"))
        )
        self.web_button.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_row.addWidget(self.gh_button)
        btn_row.addWidget(self.tw_button)
        btn_row.addWidget(self.web_button)
        right_layout.addWidget(right_title)
        right_layout.addWidget(right_desc)
        right_layout.addSpacing(8)
        right_layout.addLayout(btn_row)
        right_layout.addStretch(1)

        cards_row.addWidget(self.left_card)
        cards_row.addWidget(self.right_card)
        content_layout.addLayout(cards_row)
        content_layout.addSpacing(8)

        # Create a container for the button to ensure proper spacing
        button_container = QWidget()
        button_container.setFixedHeight(100)  # Ensure enough space for animation
        button_layout = QVBoxLayout(button_container)
        button_layout.setContentsMargins(0, 0, 0, 0)
        button_layout.setSpacing(0)

        # Start Button
        self.start_button = QPushButton("Start Using Ito")
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
        self.left_card = None
        self.right_card = None
        self.install_button = None
        self.gh_button = None
        self.tw_button = None
        self.web_button = None
        self.start_button = None
        self.content_widget = None
        self._animation_refs = []

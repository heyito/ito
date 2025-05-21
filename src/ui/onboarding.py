import sys

from PySide6.QtCore import Qt, QSettings, QPoint, QTimer
from PySide6.QtWidgets import (
    QApplication,
    QLabel,
    QMainWindow,
)
from src.ui.components.inten_layout import IntenLayout
from src.ui.theme.manager import ThemeManager
from src.ui.keyboard_manager import KeyboardManager
from src.ui.permission_checker import PermissionChecker
from src.ui.screens.onboarding.permission_screen import PermissionScreen
from src.ui.screens.onboarding.keyboard_setup_screen import KeyboardSetupScreen
from src.ui.screens.onboarding.welcome_screen import WelcomeScreen
from src.ui.screens.onboarding.completion_screen import CompletionScreen


class OnboardingWindow(QMainWindow):
    ORGANIZATION_NAME = "Inten"  # CHANGE THIS
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
        main_widget = IntenLayout(
            self, radius=8, show_close_button=True, theme_manager=self.theme_manager
        )
        main_widget.setObjectName("main_widget")
        self.setCentralWidget(main_widget)
        self.layout = main_widget.layout
        self._effective_top_margin = main_widget.get_effective_top_margin()
        self.layout.setContentsMargins(40, self._effective_top_margin, 40, 40)
        self.layout.setSpacing(20)

        # --- Initialize Permission Checker ---
        self.permission_checker = PermissionChecker()

        # --- Initialize Permission States ---
        self.permission_states = {"microphone": False, "accessibility": False}

        # --- Initialize Keyboard Manager ---
        self.keyboard_manager = KeyboardManager.instance()
        self.current_hotkey = None
        self.is_recording_hotkey = False

        # --- Show Welcome Screen ---
        self.settings = QSettings(self.ORGANIZATION_NAME, self.APPLICATION_NAME)
        setup_complete = self.settings.value(
            "permissionsSetupComplete", defaultValue=False, type=bool
        )

        if setup_complete:
            print(
                "Permissions setup previously completed. Transitioning to home screen."
            )
            # Import here to avoid circular imports
            from src.ui.home import Home

            # Create home window but don't show it yet
            self.home = Home(theme_manager=self.theme_manager)
            # Hide this window before showing the home window
            self.hide()
            # Show the home window
            self.home.show()
            # Use a timer to close this window after a short delay
            QTimer.singleShot(0, self.close)
        else:
            print("Starting permissions setup flow.")
            # If setup not done, start with the welcome screen
            self.show_welcome_screen()
            # Now show the window
            self.show()

        # Apply initial styles
        self.update_styles(self.theme_manager.current_theme)

    def update_styles(self, new_theme):
        """Update all styles based on current theme"""
        # Update primary button style
        self.setStyleSheet(f"""
            QPushButton#onboarding-primary {{
                background-color: {self.theme_manager.get_color("onboarding.button.background")};
                color: {self.theme_manager.get_color("onboarding.button.text")};
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
                background-color: {self.theme_manager.get_color("onboarding.button.hover")};
            }}
            QPushButton#onboarding-primary:disabled {{
                background-color: {self.theme_manager.get_color("onboarding.button.disabled")};
                color: {self.theme_manager.get_color("onboarding.button.disabled_text")};
            }}
        """)

        # Update current screen styles
        self.update_current_screen_styles()

    def update_current_screen_styles(self):
        """Update styles for the current screen"""
        # Find all QLabels and update their styles
        for widget in self.findChildren(QLabel):
            if widget.objectName() == "permission_text":
                widget.setStyleSheet(
                    f"color: {self.theme_manager.get_color('text_primary')};"
                )
            elif widget.objectName() == "permission_status":
                # Check if this is a status label that should be updated
                if hasattr(self, "mic_status") and widget == self.mic_status:
                    is_granted = self.permission_states.get("microphone", False)
                    widget.setStyleSheet(
                        f"color: {self.theme_manager.get_color('text_primary')};"
                        if is_granted
                        else f"color: {self.theme_manager.get_color('text_secondary')};"
                    )
                elif hasattr(self, "acc_status") and widget == self.acc_status:
                    is_granted = self.permission_states.get("accessibility", False)
                    widget.setStyleSheet(
                        f"color: {self.theme_manager.get_color('text_primary')};"
                        if is_granted
                        else f"color: {self.theme_manager.get_color('text_secondary')};"
                    )

        # Update any error messages
        for widget in self.findChildren(QLabel):
            if widget.text() == "Please grant all required permissions to continue":
                widget.setStyleSheet(f"color: {self.theme_manager.get_color('error')};")

        # Update completion screen checkmark if it exists
        for widget in self.findChildren(QLabel):
            if widget.text() == "✓":
                widget.setStyleSheet(f"""
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

        # Update title and subtitle labels
        for widget in self.findChildren(QLabel):
            if widget.text() in ["Required Permissions", "Setup Complete!"]:
                widget.setStyleSheet(f"""
                    font-size: 28px;
                    font-weight: 600;
                    color: {self.theme_manager.get_color("text_primary")};
                    margin-top: 0px;
                    margin-bottom: 6px;
                    letter-spacing: -0.5px;
                """)
            elif widget.text() in [
                "Inten needs a few permissions to help you be more productive",
                "You're all set to start using Inten!",
            ]:
                widget.setStyleSheet(f"""
                    font-size: {15 if widget.text() == "Inten needs a few permissions to help you be more productive" else 16}px;
                    color: {self.theme_manager.get_color("text_secondary")};
                    font-weight: 400;
                    margin-bottom: {40 if widget.text() == "Inten needs a few permissions to help you be more productive" else 10}px;
                    letter-spacing: 0.1px;
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

        # Create welcome screen
        self.welcome_screen = WelcomeScreen(self.theme_manager)

        # Create the screen and get the start button
        start_button = self.welcome_screen.create(self.layout)

        # Connect start button signal
        start_button.clicked.connect(self.show_permission_screen)

    def show_permission_screen(self):
        self.clear_layout()

        # Create permission screen
        self.permission_screen = PermissionScreen(
            self.theme_manager, self.permission_checker
        )
        self.permission_screen.permission_states = self.permission_states

        # Create the screen and get the buttons
        mic_button, acc_button, input_mon_button, continue_button = (
            self.permission_screen.create(self.layout)
        )

        # Connect button signals
        mic_button.clicked.connect(self.permission_screen.request_microphone_permission)
        acc_button.clicked.connect(
            self.permission_screen.request_accessibility_permission
        )
        input_mon_button.clicked.connect(
            self.permission_screen.request_input_monitoring_permission
        )
        continue_button.clicked.connect(
            self.permission_screen.check_all_permissions_and_proceed
        )

        # Connect permission checker signal
        self.permission_checker.permission_checked.connect(
            self.permission_screen.handle_permission_check
        )

    def show_keyboard_setup_screen(self):
        self.clear_layout()

        # Create keyboard setup screen
        self.keyboard_setup_screen = KeyboardSetupScreen(
            self.theme_manager, self.keyboard_manager
        )

        # Create the screen and get the continue button
        continue_button = self.keyboard_setup_screen.create(self.layout)

        # Connect continue button signal
        continue_button.clicked.connect(self.complete_keyboard_setup)

    def complete_keyboard_setup(self):
        if self.keyboard_setup_screen.current_hotkey:
            self.settings.setValue(
                "Hotkeys/start_recording_hotkey",
                self.keyboard_setup_screen.current_hotkey,
            )
            self.settings.sync()
            self.keyboard_manager.set_hotkey(self.keyboard_setup_screen.current_hotkey)
            self.keyboard_setup_screen.cleanup()
            self.show_completion_screen()

    def show_completion_screen(self):
        self.clear_layout()

        # Create completion screen
        self.completion_screen = CompletionScreen(self.theme_manager)

        # Create the screen and get the start button
        start_button = self.completion_screen.create(self.layout)

        # Connect start button signal
        start_button.clicked.connect(self.complete_setup)

    def complete_setup(self):
        """Saves the setup complete flag if needed, then transitions to the home screen."""
        print("Marking permissions setup as complete in settings.")
        # Save the flag indicating setup is done
        self.settings.setValue("permissionsSetupComplete", True)

        # Import here to avoid circular imports
        from src.ui.home import Home

        # Create home window but don't show it yet
        self.home = Home(theme_manager=self.theme_manager)
        # Hide this window before showing the home window
        self.hide()
        # Show the home window
        self.home.show()
        # Use a timer to close this window after a short delay
        QTimer.singleShot(0, self.close)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    QApplication.setOrganizationName(OnboardingWindow.ORGANIZATION_NAME)
    QApplication.setApplicationName(OnboardingWindow.APPLICATION_NAME)
    theme_manager = ThemeManager.instance()
    onboarding_window = OnboardingWindow(theme_manager=theme_manager)
    onboarding_window.show()
    sys.exit(app.exec())

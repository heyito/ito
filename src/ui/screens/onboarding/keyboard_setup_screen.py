from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QWidget,
)


class KeyboardSetupScreen:
    def __init__(self, theme_manager, keyboard_manager):
        self.theme_manager = theme_manager
        self.keyboard_manager = keyboard_manager
        self.current_hotkey = None
        self.is_recording_hotkey = False
        self.key_pills = []
        self.key_pill_container = None
        self.key_pill_layout = None
        self.key_combo_display = None
        self.continue_button = None
        self.keyboard_poll_timer = None
        self.hold_timer = None
        self._last_pressed_keys = None
        self._hold_start_time = None
        self._is_cleaned_up = False

        # Store references to widgets that need style updates
        self.title_label = None
        self.desc_label = None
        self.keyboard_container = None

        # Connect theme changes
        self.theme_manager.theme_changed.connect(self.update_styles)

    def update_styles(self):
        """Update all styles based on current theme"""
        if self._is_cleaned_up:
            return

        if self.title_label:
            self.title_label.setStyleSheet(f"""
                font-size: 34px;
                font-weight: 600;
                color: {self.theme_manager.get_color("text_primary")};
                margin-top: 0px;
                margin-bottom: 8px;
                letter-spacing: -0.5px;
            """)

        if self.desc_label:
            self.desc_label.setStyleSheet(f"""
                font-size: 16px;
                color: {self.theme_manager.get_color("text_secondary")};
                font-weight: 400;
                margin-bottom: 10px;
                letter-spacing: 0.05px;
            """)

        if self.key_combo_display:
            self.key_combo_display.setStyleSheet(f"""
                font-size: 15px;
                color: {self.theme_manager.get_color("text_secondary")};
                font-weight: 400;
                margin-top: 2px;
                letter-spacing: 0.1px;
            """)

        if self.keyboard_container:
            self.keyboard_container.setStyleSheet(f"""
                background: {self.theme_manager.get_color("surface")};
                border-radius: 22px;
            """)

        # Update key pills
        for pill in self.key_pills:
            pill.setStyleSheet(f"""
                QLabel {{
                    background: {self.theme_manager.get_color("onboarding.shadow")};
                    color: {self.theme_manager.get_color("text_primary")};
                    border-radius: 12px;
                    padding: 8px 18px;
                    font-size: 22px;
                    font-weight: 500;
                    min-width: 38px;
                    margin: 0 2px;
                }}
            """)

    def create(self, parent_layout):
        # --- Centered Layout ---
        content_layout = QVBoxLayout()
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.setSpacing(40)

        # Title
        self.title_label = QLabel("Set Up Your Keyboard Shortcut")
        self.title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        content_layout.addWidget(self.title_label)

        # Description
        self.desc_label = QLabel(
            "Press any key or key combination to set your shortcut"
        )
        self.desc_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        content_layout.addWidget(self.desc_label)

        # Keyboard display container (modern card style)
        self.keyboard_container = QWidget()
        self.keyboard_container.setObjectName("keyboard_container")
        self.keyboard_container.setFixedSize(420, 140)
        keyboard_layout = QVBoxLayout(self.keyboard_container)
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
        keyboard_layout.addWidget(
            self.key_pill_container, alignment=Qt.AlignmentFlag.AlignCenter
        )

        # Key combination display (instructions)
        self.key_combo_display = QLabel("Press any key…")
        self.key_combo_display.setObjectName("key_combo_display")
        self.key_combo_display.setAlignment(Qt.AlignmentFlag.AlignCenter)
        keyboard_layout.addWidget(self.key_combo_display)

        content_layout.addWidget(
            self.keyboard_container, alignment=Qt.AlignmentFlag.AlignCenter
        )
        content_layout.addSpacing(16)

        # Continue Button
        self.continue_button = QPushButton("Continue")
        self.continue_button.setObjectName("onboarding-primary")
        self.continue_button.setEnabled(False)
        self.continue_button.setFixedWidth(220)
        self.continue_button.setFixedHeight(48)
        content_layout.addWidget(
            self.continue_button, alignment=Qt.AlignmentFlag.AlignCenter
        )

        # --- Center the content in the main layout ---
        parent_layout.addStretch(2)
        parent_layout.addLayout(content_layout)
        parent_layout.addStretch(3)

        # Apply initial styles
        self.update_styles()

        # Start listening for keyboard input
        self.start_keyboard_listening()

        return self.continue_button

    def update_key_pills(self, keys):
        if self._is_cleaned_up:
            return

        # Remove old pills
        for pill in self.key_pills:
            self.key_pill_layout.removeWidget(pill)
            pill.deleteLater()
        self.key_pills = []
        # Add new pills
        for key in keys:
            # Convert key object to symbol/string
            key_str = self.keyboard_manager.get_key_symbol(key)
            pill = QLabel(key_str)
            pill.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.key_pill_layout.insertWidget(self.key_pill_layout.count() - 1, pill)
            self.key_pills.append(pill)

        # Update styles for new pills
        self.update_styles()

    def start_keyboard_listening(self):
        if self._is_cleaned_up:
            return

        self.is_recording_hotkey = True
        self.current_hotkey = None
        self.update_key_pills([])
        self.key_combo_display.setText("Press any key…")
        self.continue_button.setEnabled(False)
        # Start polling for pressed keys
        self.keyboard_poll_timer = QTimer()
        self.keyboard_poll_timer.timeout.connect(self.poll_pressed_keys)
        self.keyboard_poll_timer.start(50)

        # Add hold timer
        self.hold_timer = QTimer()
        self.hold_timer.setSingleShot(True)
        self.hold_timer.timeout.connect(self.on_hold_complete)
        self._last_pressed_keys = None
        self._hold_start_time = None

    def poll_pressed_keys(self):
        if not self.is_recording_hotkey or self._is_cleaned_up:
            return

        pressed_keys = self.keyboard_manager.get_pressed_keys()
        # Convert to symbols/strings for display and hotkey string
        key_symbols = [self.keyboard_manager.get_key_symbol(k) for k in pressed_keys]

        if len(key_symbols) > 0:
            # If keys changed, reset hold timer
            if self._last_pressed_keys != key_symbols:
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
        if self._is_cleaned_up:
            return

        if self._last_pressed_keys:
            self.key_combo_display.setText("Press any other key to change")
            self.continue_button.setEnabled(True)

    def cleanup(self):
        """Clean up timers and resources"""
        self._is_cleaned_up = True

        if self.keyboard_poll_timer:
            self.keyboard_poll_timer.stop()
            self.keyboard_poll_timer = None

        if self.hold_timer:
            self.hold_timer.stop()
            self.hold_timer = None

        self.is_recording_hotkey = False

        # Clear references to widgets
        self.key_pills = []
        self.key_pill_container = None
        self.key_pill_layout = None
        self.key_combo_display = None
        self.continue_button = None
        self.title_label = None
        self.desc_label = None
        self.keyboard_container = None

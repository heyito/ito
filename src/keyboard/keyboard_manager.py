import logging
import traceback
from datetime import datetime, timedelta

from pynput import keyboard
from PySide6.QtCore import QObject, QTimer, Signal

from src.types.modes import CommandMode

# Configure logger
logger = logging.getLogger(__name__)


class KeyboardManager(QObject):
    # Singleton instance
    _instance = None

    # Signal when hotkey is pressed
    hotkey_pressed = Signal(CommandMode)
    # Signal when hotkey is released
    hotkey_released = Signal(CommandMode)
    # Signal when listener status changes
    listener_status_changed = Signal(bool, str)

    @classmethod
    def instance(cls):
        if cls._instance is None:
            cls._instance = KeyboardManager()
        return cls._instance

    def __init__(self):
        if KeyboardManager._instance is not None:
            raise Exception(
                "KeyboardManager is a singleton! Use KeyboardManager.instance()"
            )
        super().__init__()
        self._event_queue = None
        self._status_queue = None
        self._target_hotkeys: dict[CommandMode, set] = None
        self._hotkey_strs: dict[CommandMode, str] = None
        self._listener_started = False
        self._tap = None
        self._key_press_times = {}  # Track when keys were pressed
        self._was_hotkey_pressed = False
        self._is_macos = False
        self._process_timer = None
        self._safety_timer = None
        self._active_mode = None
        self._is_hotkey_paused = False
        self.pressed_keys = set()

    def check_hotkey_match(self) -> CommandMode | None:
        """
        Check if the currently pressed keys match the target hotkey.
        Returns the command mode of the hotkey if matched,
        otherwise returns None.
        """
        if not self._target_hotkeys or self._is_hotkey_paused:
            return None

        # Get symbols for currently pressed keys
        current_keys = set(self.get_pressed_keys())
        for mode, hotkey in self._target_hotkeys.items():
            if current_keys == hotkey:
                return mode

        return None

    def initialize(self, event_queue, status_queue) -> bool:
        logger.info("Initializing keyboard listener")
        """Initialize the keyboard listener once. This should only be called once when the application starts."""
        if self._listener_started:
            logger.info("Keyboard listener already initialized")
            return True

        try:
            self._event_queue = event_queue
            self._status_queue = status_queue

            # Start a timer to check for events from the process
            self._process_timer = QTimer()
            self._process_timer.timeout.connect(self._check_process_events)
            self._process_timer.start(50)  # Check every 50ms

            # Start a safety timer to clear stuck keys
            self._safety_timer = QTimer()
            self._safety_timer.timeout.connect(self._check_stuck_keys)
            self._safety_timer.start(1000)  # Check every second

            logger.info("Keyboard manager initialized successfully")
            self.listener_status_changed.emit(True, "Manager initialized successfully")
            return True
        except Exception as e:
            error_msg = f"Failed to initialize keyboard manager: {str(e)}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            self.listener_status_changed.emit(False, error_msg)
            return False

    def pause_hotkey_triggers(self):
        """Pause the keyboard listener. This will stop processing events."""
        self._is_hotkey_paused = True

    def resume_hotkey_triggers(self):
        """Resume the keyboard listener. This will start processing events again."""
        self._is_hotkey_paused = False

    def _check_process_events(self):
        """Check for events from the keyboard listener process"""
        try:
            # Check status queue
            while self._status_queue and not self._status_queue.empty():
                status, message = self._status_queue.get_nowait()
                self.listener_status_changed.emit(status, message)

            # Check event queue
            while self._event_queue and not self._event_queue.empty():
                event_type, key = self._event_queue.get_nowait()
                if event_type == "press":
                    self._on_press(key)
                elif event_type == "release":
                    self._on_release(key)

        except Exception as e:
            logger.error(f"Error checking process events: {e}")

    def _check_stuck_keys(self):
        """Check for and clear any keys that have been pressed for too long"""
        current_time = datetime.now()
        stuck_keys = []

        for key, press_time in self._key_press_times.items():
            if current_time - press_time > timedelta(seconds=5):  # 5 second threshold
                stuck_keys.append(key)
                logger.warning(f"Clearing stuck key: {key}")

        for key in stuck_keys:
            self._key_press_times.pop(key, None)
            self.pressed_keys.discard(key)

    def set_hotkeys(self, hotkeys: dict[CommandMode, str]) -> bool:
        """Set the target hotkeys without restarting the listener.
        hotkey strings should be in the format 'key1+key2+key3' where each key is in symbolic form.
        Example: '⌘+⇧+a' or 'ctrl+shift+a'
        """
        try:
            # Check if the hotkeys are different
            if self._hotkey_strs == hotkeys:
                return True

            # Store the symbolic strings
            self._hotkey_strs = hotkeys

            # Convert to set of key symbols for comparison
            target_hotkeys = {}
            for mode, hotkey_str in hotkeys.items():
                target_key = set(hotkey_str.split("+"))
                target_hotkeys[mode] = target_key
                logger.info(f"Hotkey updated to: {hotkey_str}")

            self._target_hotkeys = target_hotkeys

            return True

        except Exception as e:
            logger.error(f"Failed to set hotkey: {e}")
            logger.error(traceback.format_exc())
            return False

    def get_key_symbol(self, key):
        """
        Helper function to get a symbolic representation of the key.
        Handles special keys by returning their name or a specific symbol (especially for macOS).
        For alphanumeric keys, returns the character.
        """
        # If key is already a string, return it
        if isinstance(key, str):
            return key

        try:
            # For alphanumeric keys, return the character
            if str(key) == "<63>":
                return "fn"
            return key.char
        except AttributeError:
            # For special keys (like Key.space, Key.shift, Key.esc, etc.)
            # Use macOS symbols for common modifier keys.
            if key == keyboard.Key.space:
                return "space"
            elif key == keyboard.Key.enter:
                return "enter"
            elif key == keyboard.Key.esc:
                return "esc"
            elif key == keyboard.Key.shift or key == keyboard.Key.shift_r:
                return "⇧"  # Shift symbol
            elif key == keyboard.Key.ctrl or key == keyboard.Key.ctrl_r:
                return "^"  # Control symbol
            elif key == keyboard.Key.alt or key == keyboard.Key.alt_r:
                return "⌥"  # Option (Alt) symbol
            elif key == keyboard.Key.cmd or key == keyboard.Key.cmd_r:
                return "⌘"  # Command symbol (macOS)
            elif key == keyboard.Key.backspace:
                return "backspace"
            elif key == keyboard.Key.delete:
                return "delete"
            elif key == keyboard.Key.tab:
                return "tab"
            elif key == keyboard.Key.caps_lock:
                return "caps_lock"
            elif key == keyboard.Key.up:
                return "↑"
            elif key == keyboard.Key.down:
                return "↓"
            elif key == keyboard.Key.left:
                return "←"
            elif key == keyboard.Key.right:
                return "→"
            else:
                return str(key).replace("Key.", "")  # Remove 'Key.' prefix

    def _on_press(self, key):
        """
        Callback function for key press events.
        Adds the pressed key to the set and checks for hotkey match.
        """
        try:
            key_symbol = self.get_key_symbol(key)
            self.pressed_keys.add(key_symbol)
            self._key_press_times[key_symbol] = datetime.now()

            # Check if we have a hotkey match
            mode_match = self.check_hotkey_match()

            # If we have a match and weren't previously pressed, emit the signal
            if mode_match and not self._was_hotkey_pressed:
                logger.info(f"Hotkey pressed: {mode_match}")
                self._was_hotkey_pressed = True
                self._active_mode = mode_match
                self.hotkey_pressed.emit(mode_match)

        except Exception as e:
            error_msg = f"Error in _on_press: {str(e)}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            self.listener_status_changed.emit(False, error_msg)

    def _on_release(self, key):
        """
        Callback function for key release events.
        Handles special case for key 63 (Fn on macOS).
        """
        try:
            key_symbol = self.get_key_symbol(key)

            # Special handling for Fn key (keycode 63)
            if key_symbol == "fn":
                if key_symbol not in self.pressed_keys:
                    # First release event: treat as press
                    self.pressed_keys.add(key_symbol)
                    self._key_press_times[key_symbol] = datetime.now()
                    # Check for hotkey match after adding Fn
                    mode_match = self.check_hotkey_match()
                    if mode_match and not self._was_hotkey_pressed:
                        self._was_hotkey_pressed = True
                        self.hotkey_pressed.emit(mode_match)
                        logger.info(f"Hotkey pressed: {mode_match}")
                    return
                else:
                    # Second release event: treat as release
                    self.pressed_keys.discard(key_symbol)
                    self._key_press_times.pop(key_symbol, None)
                    # Check if we should emit release signal
                    if self._was_hotkey_pressed:
                        self._was_hotkey_pressed = False
                        self.hotkey_released.emit(self._active_mode)
                        self._active_mode = None
                    return

            # Normal behavior for other keys
            else:
                self.pressed_keys.discard(key_symbol)
                self._key_press_times.pop(key_symbol, None)
                # Check if we should emit release signal
                mode_match = self.check_hotkey_match()
                if self._was_hotkey_pressed and not mode_match:
                    self._was_hotkey_pressed = False
                    self.hotkey_released.emit(self._active_mode)
                    self._active_mode = None

        except Exception as e:
            error_msg = f"Error in _on_release: {str(e)}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            self.listener_status_changed.emit(False, error_msg)

    def get_pressed_keys(self):
        """
        Returns a list of symbols for the currently pressed keys,
        up to a maximum of 3, in a consistent sorted order.
        """
        # The pressed_keys set now contains symbols directly
        key_symbols = list(self.pressed_keys)
        # Sort the symbols to ensure consistent order
        key_symbols.sort()
        # Return up to 3 keys
        return key_symbols[:3]

    def cleanup(self):
        """Clean up the keyboard manager. Should only be called when the application is closing."""
        if self._process_timer:
            self._process_timer.stop()
            self._process_timer = None

        if self._safety_timer:
            self._safety_timer.stop()
            self._safety_timer = None

        self._event_queue = None
        self._status_queue = None
        self._listener_started = False
        self._target_hotkeys = {}
        self._hotkey_strs = {}
        self._active_mode = None
        self._was_hotkey_pressed = False
        self.pressed_keys.clear()
        self._key_press_times.clear()
        logger.info("Keyboard manager cleaned up")
        self.listener_status_changed.emit(False, "Manager cleaned up")

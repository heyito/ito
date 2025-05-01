from PyQt6.QtCore import QObject, pyqtSignal
from pynput import keyboard
import traceback

class KeyboardManager(QObject):
    # Singleton instance
    _instance = None
    
    # Signal when hotkey is pressed
    hotkey_pressed = pyqtSignal(str)
    
    @classmethod
    def instance(cls):
        if cls._instance is None:
            cls._instance = KeyboardManager()
        return cls._instance
    
    def __init__(self):
        if KeyboardManager._instance is not None:
            raise Exception("KeyboardManager is a singleton! Use KeyboardManager.instance()")
        super().__init__()
        self._listener = None
        self._target_hotkey = None
        self._hotkey_str = None
        self._listener_started = False

    def initialize_listener(self) -> bool:
        """Initialize the keyboard listener once. This should only be called once when the application starts."""
        if self._listener_started:
            print("Keyboard listener already initialized")
            return True
            
        try:
            self._listener = keyboard.Listener(on_press=self._on_keyboard_press)
            self._listener.start()
            self._listener_started = True
            print("Keyboard listener initialized successfully")
            return True
        except Exception as e:
            print(f"Failed to initialize keyboard listener: {e}")
            traceback.print_exc()
            return False

    def set_hotkey(self, hotkey_str: str) -> bool:
        """Set the target hotkey without restarting the listener"""
        try:
            new_hotkey = self._parse_hotkey(hotkey_str)
            if not new_hotkey:
                print(f"Invalid hotkey: {hotkey_str}")
                return False
                
            self._hotkey_str = hotkey_str
            self._target_hotkey = new_hotkey
            print(f"Hotkey updated to: {hotkey_str}")
            return True
            
        except Exception as e:
            print(f"Failed to set hotkey: {e}")
            traceback.print_exc()
            return False

    def cleanup(self):
        """Clean up the keyboard listener. Should only be called when the application is closing."""
        if self._listener and self._listener_started:
            try:
                self._listener.stop()
                self._listener = None
                self._listener_started = False
                self._target_hotkey = None
                self._hotkey_str = None
                print("Keyboard listener cleaned up")
            except Exception as e:
                print(f"Error cleaning up keyboard listener: {e}")

    def _parse_hotkey(self, hotkey_str: str):
        """Parse hotkey string into pynput key object"""
        try:
            # Check if it's a special key (like Key.f9)
            return getattr(keyboard.Key, hotkey_str)
        except AttributeError:
            # If not a special key, treat as character key
            if len(hotkey_str) == 1:
                return keyboard.KeyCode.from_char(hotkey_str)
            return None

    def _on_keyboard_press(self, key):
        """Internal callback for keyboard events"""
        if key == self._target_hotkey:
            self.hotkey_pressed.emit(self._hotkey_str) 
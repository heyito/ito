import traceback
import platform
import Quartz

from pynput import keyboard
from PyQt6.QtCore import QObject, pyqtSignal


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
        self._tap = None
        self._is_macos = platform.system() == 'Darwin'

    def initialize_listener(self) -> bool:
        """Initialize the keyboard listener once. This should only be called once when the application starts."""
        if self._listener_started:
            print("Keyboard listener already initialized")
            return True
            
        try:
            if self._is_macos:
                # On macOS, use Quartz for keyboard events
                self._setup_quartz_listener()
            else:
                # On other platforms, use pynput
                self._listener = keyboard.Listener(on_press=self._on_keyboard_press)
                self._listener.start()
            
            self._listener_started = True
            print("Keyboard listener initialized successfully")
            return True
        except Exception as e:
            print(f"Failed to initialize keyboard listener: {e}")
            traceback.print_exc()
            return False

    def _setup_quartz_listener(self):
        """Set up Quartz event tap for keyboard events on macOS"""
        def callback(proxy, type_, event, refcon):
            if type_ == Quartz.kCGEventKeyDown:
                # Get the keycode from the event
                keycode = Quartz.CGEventGetIntegerValueField(event, Quartz.kCGKeyboardEventKeycode)
                
                # Check if this is our target key (Fn key has keycode 179)
                if keycode == 179 and self._target_hotkey and self._hotkey_str == 'fn':
                    # Emit the signal
                    self.hotkey_pressed.emit(self._hotkey_str)
                    # Return None to consume the event
                    return None
            
            # Return the event for all other keys
            return event

        # Create the event tap
        self._tap = Quartz.CGEventTapCreate(
            Quartz.kCGSessionEventTap,
            Quartz.kCGHeadInsertEventTap,
            Quartz.kCGEventTapOptionDefault,
            Quartz.CGEventMaskBit(Quartz.kCGEventKeyDown),
            callback,
            None
        )

        if self._tap:
            # Create a run loop source and add it to the current run loop
            runLoopSource = Quartz.CFMachPortCreateRunLoopSource(None, self._tap, 0)
            Quartz.CFRunLoopAddSource(
                Quartz.CFRunLoopGetCurrent(),
                runLoopSource,
                Quartz.kCFRunLoopDefaultMode
            )
            # Enable the event tap
            Quartz.CGEventTapEnable(self._tap, True)

    def set_hotkey(self, hotkey_str: str) -> bool:
        """Set the target hotkey without restarting the listener"""
        try:
            if self._is_macos and hotkey_str.lower() == 'fn':
                # For Fn key on macOS, we just store the string
                self._hotkey_str = hotkey_str
                self._target_hotkey = True
                print(f"Hotkey updated to: {hotkey_str}")
                return True
            
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
        if self._is_macos and self._tap:
            try:
                Quartz.CGEventTapEnable(self._tap, False)
                self._tap = None
            except Exception as e:
                print(f"Error cleaning up Quartz event tap: {e}")
        elif self._listener and self._listener_started:
            try:
                self._listener.stop()
                self._listener = None
            except Exception as e:
                print(f"Error cleaning up keyboard listener: {e}")
        
        self._listener_started = False
        self._target_hotkey = None
        self._hotkey_str = None
        print("Keyboard listener cleaned up")

    def _parse_hotkey(self, hotkey_str: str):
        """Parse hotkey string into pynput key object"""
        try:
            # Special case for Fn key
            if hotkey_str.lower() == 'fn':
                # Create a KeyCode with the Fn key's virtual key code (179)
                return keyboard.KeyCode(vk=179)
            
            # Check if it's a special key (like Key.f9)
            return getattr(keyboard.Key, hotkey_str)
        except AttributeError:
            # If not a special key, treat as character key
            if len(hotkey_str) == 1:
                return keyboard.KeyCode.from_char(hotkey_str)
            return None

    def _on_keyboard_press(self, key):
        """Internal callback for keyboard events (non-macOS)"""
        if key == self._target_hotkey:
            self.hotkey_pressed.emit(self._hotkey_str)
            return False
        return True 
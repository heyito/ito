import traceback
import platform
import Quartz

from pynput import keyboard
from PySide6.QtCore import QObject, Signal

class KeyboardManager(QObject):
    # Singleton instance
    _instance = None

    # Signal when hotkey is pressed
    hotkey_pressed = Signal(str)
    # Signal when hotkey is released
    hotkey_released = Signal(str)
    
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
        self._listener = None
        self._target_hotkey = None
        self._hotkey_str = None
        self._listener_started = False
        self._tap = None
        self.pressed_keys = set()

        # self._is_macos = platform.system() == 'Darwin'
        self._is_macos = False

        # Map of function key names to their Quartz keycodes
        self._function_key_codes = {
            "f1": 122,
            "f2": 120,
            "f3": 99,
            "f4": 118,
            "f5": 96,
            "f6": 97,
            "f7": 98,
            "f8": 100,
            "f9": 101,
            "f10": 109,
            "f11": 103,
            "f12": 111,
            "fn": 179,
        }

    def initialize_listener(self) -> bool:
        print("Initializing keyboard listener")
        """Initialize the keyboard listener once. This should only be called once when the application starts."""
        if self._listener_started:
            print("Keyboard listener already initialized")
            return True

        try:
            if self._is_macos:
                # On macOS, use Quartz for keyboard events
                self._setup_quartz_listener()
                self._listener_started = True
            else:
                self._listener = keyboard.Listener(
                    on_press=self._on_press,
                    on_release=self._on_release,
                )
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
            if type_ in (Quartz.kCGEventKeyDown, Quartz.kCGEventKeyUp, Quartz.kCGEventFlagsChanged):
                # Get the keycode from the event
                keycode = Quartz.CGEventGetIntegerValueField(
                    event, Quartz.kCGKeyboardEventKeycode
                )

                # Get the flags from the event
                flags = Quartz.CGEventGetFlags(event)

                # print(f"Quartz keycode: {keycode}, flags: {flags}")

                # Check if this is our target key
                if self._target_hotkey and isinstance(self._target_hotkey, int):
                    # Handle both direct Fn key (179) and Fn-modified keys (63 for F3)
                    # print(f"Target hotkey: {self._target_hotkey}, keycode: {keycode}, type_: {'DOWN' if type_ == Quartz.kCGEventKeyDown else 'UP'}")
                    if keycode == self._target_hotkey or (keycode == 63 and flags & 0x800000):
                        if type_ == Quartz.kCGEventKeyDown:
                            pass
                            # print(f"Hotkey pressed: {self._hotkey_str}")
                            # Emit the pressed signal
                            # self.hotkey_pressed.emit(self._hotkey_str)
                        elif type_ == Quartz.kCGEventKeyUp:
                            pass
                            # print(f"Hotkey released: {self._hotkey_str}")
                            # Emit the released signal
                            # self.hotkey_released.emit(self._hotkey_str)
                        # Return None to consume the event
                        return None

            # Return the event for all other keys
            return event

        # Create the event tap
        event_mask = (
            Quartz.CGEventMaskBit(Quartz.kCGEventKeyDown) |
            Quartz.CGEventMaskBit(Quartz.kCGEventKeyUp) |
            Quartz.CGEventMaskBit(Quartz.kCGEventFlagsChanged)
        )
        self._tap = Quartz.CGEventTapCreate(
            Quartz.kCGSessionEventTap,
            Quartz.kCGHeadInsertEventTap,
            Quartz.kCGEventTapOptionDefault,
            event_mask,
            callback,
            None,
        )

        if self._tap:
            # Create a run loop source and add it to the current run loop
            runLoopSource = Quartz.CFMachPortCreateRunLoopSource(None, self._tap, 0)
            Quartz.CFRunLoopAddSource(
                Quartz.CFRunLoopGetCurrent(),
                runLoopSource,
                Quartz.kCFRunLoopDefaultMode,
            )
            # Enable the event tap
            Quartz.CGEventTapEnable(self._tap, True)

    def set_hotkey(self, hotkey_str: str) -> bool:
        """Set the target hotkey without restarting the listener"""
        try:
            if self._is_macos:
                # For macOS, we need to handle function keys differently
                hotkey_str = hotkey_str.lower()
                if hotkey_str in self._function_key_codes:
                    self._hotkey_str = hotkey_str
                    self._target_hotkey = self._function_key_codes[hotkey_str]
                    return True
                else:
                    print(f"Unsupported hotkey for macOS: {hotkey_str}")
                    return False

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
            if hotkey_str.lower() == "fn":
                # Create a KeyCode with the Fn key's virtual key code (179)
                return keyboard.KeyCode(vk=179)

            # Check if it's a special key (like Key.f9)
            return getattr(keyboard.Key, hotkey_str)
        except AttributeError:
            # If not a special key, treat as character key
            if len(hotkey_str) == 1:
                return keyboard.KeyCode.from_char(hotkey_str)
            return None
        
    def get_key_symbol(self, key):
        """
        Helper function to get a symbolic representation of the key.
        Handles special keys by returning their name or a specific symbol (especially for macOS).
        For alphanumeric keys, returns the character.
        """
        try:
            # For alphanumeric keys, return the character
            if str(key) == '<63>':
                return 'fn'
            return key.char
        except AttributeError:
            print('I got this key: ', key, type(key))
            # For special keys (like Key.space, Key.shift, Key.esc, etc.)
            # Use macOS symbols for common modifier keys.
            if key == keyboard.Key.space:
                return 'space'
            elif key == keyboard.Key.enter:
                return 'enter'
            elif key == keyboard.Key.esc:
                return 'esc'
            elif key == keyboard.Key.shift or key == keyboard.Key.shift_r:
                return '⇧' # Shift symbol
            elif key == keyboard.Key.ctrl or key == keyboard.Key.ctrl_r:
                return '^' # Control symbol
            elif key == keyboard.Key.alt or key == keyboard.Key.alt_r:
                return '⌥' # Option (Alt) symbol
            elif key == keyboard.Key.cmd or key == keyboard.Key.cmd_r:
                return '⌘' # Command symbol (macOS)
            elif key == keyboard.Key.menu:
                return 'menu'
            elif key == keyboard.Key.backspace:
                return 'backspace'
            elif key == keyboard.Key.delete:
                return 'delete'
            elif key == keyboard.Key.tab:
                return 'tab'
            elif key == keyboard.Key.caps_lock:
                return 'caps_lock'
            elif key == keyboard.Key.up:
                return '↑'
            elif key == keyboard.Key.down:
                return '↓'
            elif key == keyboard.Key.left:
                return '←'
            elif key == keyboard.Key.right:
                return '→'
            # Add more mappings for other special keys as needed
            else:
                # For other special keys (like F1-F12, page_up, home, etc.),
                # pynput's default representation is often sufficient.
                return str(key).replace('Key.', '') # Remove 'Key.' prefix
            
    def _on_press(self, key):
        """
        Callback function for key press events.
        Adds the pressed key to the set.
        """
        # Using a try-except block to handle keys without a char attribute
        try:
            print(f'Key pressed: {key}')
            # Add the key object directly to the set
            self.pressed_keys.add(key)
            # print(f'Key pressed: {key}') # Optional: for debugging
        except Exception as e:
            # Handle special keys which don't have a .char attribute
            # print(f'Special key pressed: {key}') # Optional: for debugging
            self.pressed_keys.add(key)


    def _on_release(self, key):
        """
        Callback function for key release events.
        Handles special case for key 63 (Fn on macOS).
        """
        try:
            print(f'Key released: {key}')
            # Special handling for Fn key (keycode 63)
            if hasattr(key, 'vk') and key.vk == 63:
                if key not in self.pressed_keys:
                    # First release event: treat as press
                    self.pressed_keys.add(key)
                    return
                else:
                    # Second release event: treat as release
                    self.pressed_keys.remove(key)
                    return
            # Normal behavior for other keys
            if key in self.pressed_keys:
                self.pressed_keys.remove(key)
        except KeyError:
            pass
        except Exception as e:
            pass

        # Stop listener
        if key == keyboard.Key.esc:
            return False


    def get_pressed_keys(self):
        """
        Returns a list of symbols for the currently pressed keys,
        up to a maximum of 3.
        """
        # Convert the set of key objects to a list of their symbols
        # and limit the list to the first 3 elements
        return list(self.pressed_keys)[:3]
        
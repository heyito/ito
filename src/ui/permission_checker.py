import ctypes
import logging
import platform
import subprocess
import traceback
from ctypes import CFUNCTYPE, POINTER, c_int, c_uint32, c_uint64, c_void_p, cdll

import sounddevice as sd
from PySide6.QtCore import QObject, Signal

logger = logging.getLogger("ai.ito.ito.ui")


class PermissionChecker(QObject):
    permission_checked = Signal(str, bool)  # permission_name, is_granted

    def check_microphone(self):
        """Check if the application has microphone permissions."""
        try:
            logger.info("Checking microphone permissions...")
            devices = sd.query_devices()
            input_devices = [d for d in devices if d["max_input_channels"] > 0]
            if not input_devices:
                logger.error("No input devices found")
                self.permission_checked.emit("microphone", False)

            # Try to open a test stream to verify permissions
            try:
                with sd.InputStream(
                    samplerate=16000, channels=1, blocksize=128, latency="low"
                ):
                    logger.info(
                        "Successfully opened test audio stream - permissions granted"
                    )
                    self.permission_checked.emit("microphone", True)
            except sd.PortAudioError as e:
                logger.error(f"Failed to open test audio stream: {e}")
                self.permission_checked.emit("microphone", False)

        except Exception as e:
            logger.error(f"Error checking microphone permissions: {e}")
            self.permission_checked.emit("microphone", False)

    def check_accessibility(self):
        if platform.system() == "Darwin":
            try:
                from src import platform_utils_macos

                logger.info("Checking accessibility permissions...")
                has_permission = platform_utils_macos.check_accessibility_permission()
                logger.info(f"Accessibility permission check result: {has_permission}")
                self.permission_checked.emit("accessibility", has_permission)
            except ImportError as e:
                logger.error(f"Error importing platform_utils_macos: {e}")
                self.permission_checked.emit("accessibility", False)
            except Exception as e:
                logger.error(f"Error checking accessibility permission: {e}")
                logger.error(traceback.format_exc())
                self.permission_checked.emit("accessibility", False)
        else:
            logger.info("Not on macOS, assuming accessibility permissions granted")
            self.permission_checked.emit("accessibility", True)

    def check_automation(self, target_app="System Events"):
        """
        Request automation permission by attempting to control another app.
        This will trigger the system permission dialog.

        Args:
            target_app: The app you want to automate (triggers permission for that specific app)
        """
        try:
            # This AppleScript attempt will trigger the automation permission dialog
            script = f'''
            tell application "{target_app}"
                -- This simple command will trigger permission request
                get name
            end tell
            '''

            result = subprocess.run(
                ["osascript", "-e", script], capture_output=True, text=True, check=False
            )

            # If successful, permission was granted (or already existed)
            is_granted = result.returncode == 0
            logger.info(f"Automation permission check result: {is_granted}")
            self.permission_checked.emit("automation", is_granted)

        except Exception as e:
            logger.error(f"Error requesting automation permission: {e}")
            self.permission_checked.emit("automation", False)

    def check_input_monitoring(self):
        """
        Check if the application has input monitoring permissions on macOS using CGEventTapCreate.
        This will trigger the system permission dialog if not already granted.
        """
        if platform.system() != "Darwin":
            logger.info("Not on macOS, assuming input monitoring permissions granted")
            self.permission_checked.emit("input_monitoring", True)
            return

        try:
            # Load the CoreGraphics framework
            cg = cdll.LoadLibrary(
                "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics"
            )

            # Define the callback function type
            CGEventTapCallBack = CFUNCTYPE(c_void_p, c_int, c_void_p, c_void_p)

            # Define the callback function
            def callback(proxy, type, event, refcon):
                return event

            # Create the callback
            callback_func = CGEventTapCallBack(callback)

            # Constants for CGEventTapCreate
            kCGSessionEventTap = 0
            kCGHeadInsertEventTap = 0
            kCGEventTapOptionDefault = 0
            kCGEventMaskForAllEvents = 0xFFFFFFFFFFFFFFFF

            # Set up function signatures
            cg.CGEventTapCreate.argtypes = [
                c_int,
                c_int,
                c_int,
                c_uint64,
                CGEventTapCallBack,
                c_void_p,
            ]
            cg.CGEventTapCreate.restype = c_void_p
            cg.CFMachPortInvalidate.argtypes = [c_void_p]
            cg.CFMachPortInvalidate.restype = None

            # Try to create an event tap
            tap = cg.CGEventTapCreate(
                kCGSessionEventTap,
                kCGHeadInsertEventTap,
                kCGEventTapOptionDefault,
                kCGEventMaskForAllEvents,
                callback_func,
                None,
            )

            # If tap is None, permission was denied
            has_permission = tap is not None
            if tap is not None:
                cg.CFMachPortInvalidate(tap)

            logger.info(f"Input monitoring permission check result: {has_permission}")
            self.permission_checked.emit("input_monitoring", has_permission)

        except Exception as e:
            logger.error(f"Error checking input monitoring permission: {e}")
            logger.error(traceback.format_exc())
            self.permission_checked.emit("input_monitoring", False)

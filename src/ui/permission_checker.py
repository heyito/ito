import logging
import platform
import subprocess
import traceback

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

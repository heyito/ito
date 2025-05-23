import logging
import platform
import traceback

import sounddevice as sd
from PySide6.QtCore import QObject, Signal

logger = logging.getLogger("ai.inten.inten.ui")


class PermissionChecker(QObject):
    permission_checked = Signal(str, bool)  # permission_name, is_granted

    def check_microphone(self):
        if platform.system() == "Darwin":
            try:
                from AVFoundation import AVCaptureDevice, AVMediaTypeAudio

                def mic_callback(granted):
                    logger.info(f"Microphone permission callback received: {granted}")
                    self.permission_checked.emit("microphone", granted)

                logger.info("Requesting microphone permission via AVFoundation...")
                AVCaptureDevice.requestAccessForMediaType_completionHandler_(
                    AVMediaTypeAudio, mic_callback
                )
            except ImportError as e:
                logger.error(f"Error importing AVFoundation: {e}")
                self.permission_checked.emit("microphone", False)
            except Exception as e:
                logger.error(
                    f"Unexpected error checking microphone via AVFoundation: {e}"
                )
                logger.error(traceback.format_exc())
                self.permission_checked.emit("microphone", False)
        else:
            try:
                # Just try to query the default input device - this triggers permission check
                # without actually opening a stream
                device_info = sd.query_devices(kind="input")
                logger.info(
                    f"Microphone permission granted - found device: {device_info['name']}"
                )
                self.permission_checked.emit("microphone", True)
            except sd.PortAudioError as e:
                logger.error(f"Microphone permission error: {e}")
                self.permission_checked.emit("microphone", False)
            except Exception as e:
                logger.error(f"Unexpected error checking microphone: {e}")
                logger.error(traceback.format_exc())
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

    def check_input_monitoring(self):
        if platform.system() == "Darwin":
            try:
                from src import platform_utils_macos

                logger.info("Checking input monitoring permissions...")
                has_permission = (
                    platform_utils_macos.check_input_monitoring_permission()
                )
                logger.info(
                    f"Input monitoring permission check result: {has_permission}"
                )
                self.permission_checked.emit("input_monitoring", has_permission)
            except ImportError as e:
                logger.error(f"Error importing platform_utils_macos: {e}")
                self.permission_checked.emit("input_monitoring", False)
            except Exception as e:
                logger.error(f"Error checking input monitoring permission: {e}")
                logger.error(traceback.format_exc())
                self.permission_checked.emit("input_monitoring", False)
        else:
            logger.info("Not on macOS, assuming input monitoring permissions granted")
            self.permission_checked.emit("input_monitoring", True)

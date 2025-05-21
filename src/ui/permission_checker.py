import platform
import traceback

import sounddevice as sd
from PySide6.QtCore import QObject, Signal


class PermissionChecker(QObject):
    permission_checked = Signal(str, bool)  # permission_name, is_granted

    def check_microphone(self):
        try:
            # Just try to query the default input device - this triggers permission check
            # without actually opening a stream
            device_info = sd.query_devices(kind="input")
            print(
                f"Microphone permission granted - found device: {device_info['name']}"
            )
            self.permission_checked.emit("microphone", True)
        except sd.PortAudioError as e:
            print(f"Microphone permission error: {e}")
            self.permission_checked.emit("microphone", False)
        except Exception as e:
            print(f"Unexpected error checking microphone: {e}")
            traceback.print_exc()
            self.permission_checked.emit("microphone", False)

    def check_accessibility(self):
        if platform.system() == "Darwin":
            try:
                from src import platform_utils_macos

                print("Checking accessibility permissions...")
                has_permission = platform_utils_macos.check_accessibility_permission()
                print(f"Accessibility permission check result: {has_permission}")
                self.permission_checked.emit("accessibility", has_permission)
            except ImportError as e:
                print(f"Error importing platform_utils_macos: {e}")
                self.permission_checked.emit("accessibility", False)
            except Exception as e:
                print(f"Error checking accessibility permission: {e}")
                traceback.print_exc()
                self.permission_checked.emit("accessibility", False)
        else:
            print("Not on macOS, assuming accessibility permissions granted")
            self.permission_checked.emit("accessibility", True)

    def check_input_monitoring(self):
        if platform.system() == "Darwin":
            try:
                from src import platform_utils_macos

                print("Checking input monitoring permissions...")
                has_permission = (
                    platform_utils_macos.check_input_monitoring_permission()
                )
                print(f"Input monitoring permission check result: {has_permission}")
                self.permission_checked.emit("input_monitoring", has_permission)
            except ImportError as e:
                print(f"Error importing platform_utils_macos: {e}")
                self.permission_checked.emit("input_monitoring", False)
            except Exception as e:
                print(f"Error checking input monitoring permission: {e}")
                traceback.print_exc()
                self.permission_checked.emit("input_monitoring", False)
        else:
            print("Not on macOS, assuming input monitoring permissions granted")
            self.permission_checked.emit("input_monitoring", True)

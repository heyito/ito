import logging
import platform
import traceback
from ctypes import c_int, cdll

import soundcard as sc
from AppKit import NSScreen
from PySide6.QtCore import QObject, Signal
from Quartz.CoreGraphics import (
    CGRectMake,
    CGWindowListCreateImage,
    kCGNullWindowID,
    kCGWindowImageBoundsIgnoreFraming,
    kCGWindowImageNominalResolution,
    kCGWindowListOptionOnScreenOnly,
)

logger = logging.getLogger("ai.ito.ito.ui")


class PermissionChecker(QObject):
    permission_checked = Signal(str, bool)  # permission_name, is_granted

    def check_microphone(self):
        """Check if the application has microphone permissions using SoundCard."""
        try:
            logger.info("Checking microphone permissions with SoundCard...")

            mics = sc.all_microphones(include_loopback=False)
            if not mics:
                logger.error("No microphones found by SoundCard.")
                self.permission_checked.emit("microphone", False)
                return

            try:
                with sc.default_microphone().recorder(samplerate=16000, channels=1):
                    logger.info(
                        "Successfully opened test audio stream - microphone permissions granted."
                    )
                    self.permission_checked.emit("microphone", True)
            except Exception as e:
                # Any exception here (often a RuntimeError on macOS) indicates a permissions issue.
                logger.error(
                    f"Failed to open test audio stream, likely due to permissions: {e}"
                )
                self.permission_checked.emit("microphone", False)

        except Exception as e:
            logger.error(
                f"An unexpected error occurred while checking microphone permissions: {e}"
            )
            self.permission_checked.emit("microphone", False)

    def check_accessibility(self):
        if platform.system() == "Darwin":
            try:
                from src.utils import platform_utils_macos

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

    def check_screen_recording(self):
        if platform.system() != "Darwin":
            logger.info(
                "Not on macOS, assuming screen recording and system audio permissions granted"
            )
            if self.permission_checked:
                self.permission_checked.emit("screen_recording", True)
            return

        try:
            # First, check if permission is already granted.
            # This uses the method you already have.
            core_graphics = cdll.LoadLibrary(
                "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics"
            )
            core_graphics.CGPreflightScreenCaptureAccess.restype = c_int
            has_screen_permission = core_graphics.CGPreflightScreenCaptureAccess() == 1
            logger.info(
                f"Screen recording permission pre-check result: {has_screen_permission}"
            )

            if has_screen_permission:
                if self.permission_checked:
                    self.permission_checked.emit("screen_recording", True)
                return

            logger.info(
                "Screen recording permission not granted. Attempting to trigger dialog..."
            )

            # Attempt to capture a small region of the screen to trigger the dialog
            # This needs to be a valid CGRect. Let's try capturing a 1x1 pixel at (0,0)
            # This is a very minimal capture that should still trigger the prompt.
            screen_rect = NSScreen.mainScreen().frame()
            # Try to capture a tiny rect from the main screen's origin
            test_rect = CGRectMake(screen_rect.origin.x, screen_rect.origin.y, 1, 1)

            # CGWindowListCreateImage is the key. Calling it attempts screen capture.
            # Even if we don't use the returned image, the act of calling it triggers the prompt.
            # We are calling it with the same options that your Swift code uses
            # to ensure it's a "real" screen capture attempt.
            _image_ref = CGWindowListCreateImage(
                test_rect,
                kCGWindowListOptionOnScreenOnly,
                kCGNullWindowID,
                kCGWindowImageNominalResolution | kCGWindowImageBoundsIgnoreFraming,
            )

            # After the attempt, re-check the permission.
            has_screen_permission_after_attempt = (
                core_graphics.CGPreflightScreenCaptureAccess() == 1
            )
            logger.info(
                f"Screen recording permission after attempt: {has_screen_permission_after_attempt}"
            )

            if self.permission_checked:
                self.permission_checked.emit(
                    "screen_recording", has_screen_permission_after_attempt
                )

        except Exception as e:
            logger.error(f"Error checking or attempting screen recording: {e}")
            logger.error(traceback.format_exc())
            if self.permission_checked:
                self.permission_checked.emit("screen_recording", False)

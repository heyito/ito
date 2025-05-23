import json
import logging
import multiprocessing
import os
import platform
import signal
import sys
import traceback

import sounddevice as sd
from PySide6.QtWidgets import QApplication

from src.ui.keyboard_manager import KeyboardManager
from src.ui.onboarding import OnboardingWindow
from src.ui.theme.manager import ThemeManager

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

multiprocessing.freeze_support()

if platform.system() == "Darwin":
    try:
        from src import platform_utils_macos as platform_utils
    except ImportError:
        logger.warning(
            "Running on macOS but failed to import 'platform_utils_macos'. OS interaction will fail."
        )

        class PlatformUtilsDummy:
            def is_macos(self):
                return True

            def get_active_window_info(self):
                logger.error("platform_utils_macos import failed.")
                return None

            def get_textedit_content(self):
                logger.error("platform_utils_macos import failed.")
                return None

            def set_textedit_content(self, text):
                logger.error("platform_utils_macos import failed.")
                return False

        platform_utils = PlatformUtilsDummy()
else:
    logger.warning(f"Running on {platform.system()}. OS-specific interactions limited.")

    class PlatformUtilsDummy:
        def is_macos(self):
            return False

        def get_active_window_info(self):
            logger.warning("OS interaction not supported on this platform.")
            return None

        def get_textedit_content(self):
            logger.warning("TextEdit interaction not supported.")
            return None

        def set_textedit_content(self, text):
            logger.warning("TextEdit interaction not supported.")
            return False

    platform_utils = PlatformUtilsDummy()


def check_microphone_permission():
    """Check if microphone permission is granted and request it if needed."""
    try:
        # Try to query the default input device - this triggers permission check
        device_info = sd.query_devices(kind="input")
        logger.info(
            f"Microphone permission granted - found device: {device_info['name']}"
        )
        return True
    except sd.PortAudioError as e:
        logger.error(f"Microphone permission error: {e}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error checking microphone: {e}")
        traceback.print_exc()
        return False


def run_native_messaging_host():
    """Run the native messaging host functionality"""
    from native_messaging_host import main as native_messaging_main

    native_messaging_main()


def ensure_native_messaging_host_registered(native_messaging_script_path):
    """Ensure the native messaging host manifest is registered with Chrome"""
    try:
        # Only need manifest directory now
        manifest_dir = os.path.expanduser(
            "~/Library/Application Support/Google/Chrome/NativeMessagingHosts"
        )

        # Create manifest directory
        os.makedirs(manifest_dir, exist_ok=True)

        # Create and write manifest file
        manifest = {
            "name": "ai.inten.app",
            "description": "Inten native messaging host",
            "path": native_messaging_script_path,
            "type": "stdio",
            "allowed_origins": ["chrome-extension://jgfjmabgdpbccfecnilbjnjoglnholem/"],
        }
        logger.info("Creating manifest: %s", manifest)

        manifest_path = os.path.join(manifest_dir, "ai.inten.app.json")
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)

        # Set manifest permissions
        os.chmod(manifest_path, 0o644)

        logger.info("Native messaging host manifest registered successfully")

    except Exception as e:
        logger.error(f"Failed to register native messaging host manifest: {e}")


# --- Signal Handlers ---
def signal_handler(signum, frame):
    """Handle termination signals gracefully."""
    logger.info(f"Received signal {signum}. Initiating graceful shutdown...")
    # Get the QApplication instance
    app = QApplication.instance()
    if app:
        # Close all windows
        for window in app.topLevelWidgets():
            window.close()
        # Quit the application
        app.quit()
    else:
        sys.exit(0)


# Register signal handlers
signal.signal(signal.SIGINT, signal_handler)  # Ctrl+C
signal.signal(signal.SIGTERM, signal_handler)  # Termination signal

# --- Main Execution Block ---
if __name__ == "__main__":
    dev_mode = os.getenv("DEV")
    if dev_mode:
        logger.info("Dev mode enabled")
        current_dir = os.path.dirname(os.path.abspath(__file__))
        native_messaging_script_path = os.path.join(
            current_dir, "native_messaging_host.sh"
        )
    else:
        logger.info("Dev mode disabled")
        native_messaging_script_path = (
            "/Applications/Inten.app/Contents/Resources/native_messaging_host.sh"
        )

    if len(sys.argv) > 1 and sys.argv[1] == "--native-messaging-host":
        logger.info("Starting native messaging host...")
        run_native_messaging_host()
    else:
        # Register native messaging host first
        ensure_native_messaging_host_registered(native_messaging_script_path)

        # Create QApplication instance
        app = QApplication(sys.argv)
        QApplication.setOrganizationName(OnboardingWindow.ORGANIZATION_NAME)
        QApplication.setApplicationName(OnboardingWindow.APPLICATION_NAME)

        # Check microphone permission before proceeding
        if not check_microphone_permission():
            logger.warning(
                "Microphone permission not granted. The app may not function properly."
            )
            logger.warning(
                "Please grant microphone access in System Settings > Privacy & Security > Microphone"
            )

        # Initialize keyboard manager (without setting hotkey yet)
        keyboard_manager = KeyboardManager.instance()
        keyboard_manager.initialize_listener()

        # Initialize theme manager from the containers
        theme_manager = ThemeManager.instance()

        # Create and show the OnboardingWindow
        onboarding_window = OnboardingWindow(
            theme_manager=theme_manager,
        )
        onboarding_window.show()

        # Start the event loop
        sys.exit(app.exec())

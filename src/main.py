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

from src.ui.keyboard_listener import KeyboardListenerProcess
from src.ui.keyboard_manager import KeyboardManager
from src.ui.onboarding import OnboardingWindow
from src.ui.theme.manager import ThemeManager

# Configure logging to write to both stderr and a file
try:
    # Try to write to user's home directory first
    log_dir = os.path.expanduser("~/Library/Logs/Inten")
    log_file = os.path.join(log_dir, "inten.log")

    # Try to create directory and verify we can write to it
    try:
        os.makedirs(log_dir, exist_ok=True)
        # Test write access
        with open(log_file, "a") as f:
            f.write("=== Log file initialized ===\n")
    except Exception as e:
        # If we can't write to ~/Library/Logs, try /tmp
        print(f"Could not write to {log_dir}: {e}")
        log_dir = "/tmp/Inten"
        log_file = os.path.join(log_dir, "inten.log")
        os.makedirs(log_dir, exist_ok=True)
        with open(log_file, "a") as f:
            f.write("=== Log file initialized (using /tmp) ===\n")

    print(f"Log file location: {log_file}")  # Print to stderr for immediate visibility

    # Create a file handler
    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    )

    # Create a stream handler for stderr
    stream_handler = logging.StreamHandler(sys.stderr)
    stream_handler.setLevel(logging.DEBUG)
    stream_handler.setFormatter(
        logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    )

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(stream_handler)

    # Configure specific loggers
    loggers = [
        "ai.inten.inten.main",
        "ai.inten.inten.keyboard",
        "ai.inten.inten.native_messaging",
        "StreamingApp",
        "StreamingRunner",
    ]

    for logger_name in loggers:
        logger = logging.getLogger(logger_name)
        logger.setLevel(logging.DEBUG)
        # Don't propagate to root logger to avoid duplicate messages
        logger.propagate = False
        logger.addHandler(file_handler)
        logger.addHandler(stream_handler)

    # Create logger for the main module and log immediately
    logger = logging.getLogger("ai.inten.inten.main")
    logger.info("=== Application starting ===")
    logger.info(f"Python version: {sys.version}")
    logger.info(f"Platform: {platform.platform()}")
    logger.info(f"Current directory: {os.getcwd()}")
    logger.info(f"Script path: {os.path.abspath(__file__)}")
    logger.info(f"Log file: {log_file}")
    logger.debug("Debug logging enabled")

except Exception as e:
    # If logging setup fails, at least print to stderr
    print(f"Failed to setup logging: {e}")
    print(f"Error details: {traceback.format_exc()}")
    # Fall back to basic stderr logging
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        stream=sys.stderr,
    )
    logger = logging.getLogger("ai.inten.inten.main")
    logger.error(f"Failed to setup file logging: {e}")

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


def check_accessibility_permission() -> bool:
    """Check if the application has accessibility permissions on macOS."""
    if platform.system() != "Darwin":
        return True

    try:
        from src.platform_utils_macos import check_accessibility_permission as check_ax

        return check_ax()
    except Exception as e:
        logger.error(f"Error checking accessibility permissions: {e}")
        logger.error(traceback.format_exc())
        return False


def check_microphone_permission() -> bool:
    """Check if the application has microphone permissions."""
    try:
        logger.info("Checking microphone permissions...")
        devices = sd.query_devices()
        input_devices = [d for d in devices if d["max_input_channels"] > 0]
        if not input_devices:
            logger.error("No input devices found")
            return False

        # Try to open a test stream to verify permissions
        try:
            with sd.InputStream(
                samplerate=16000, channels=1, blocksize=128, latency="low"
            ):
                logger.info(
                    "Successfully opened test audio stream - permissions granted"
                )
                return True
        except sd.PortAudioError as e:
            logger.error(f"Failed to open test audio stream: {e}")
            return False

    except Exception as e:
        logger.error(f"Error checking microphone permissions: {e}")
        return False


def run_native_messaging_host():
    """Run the native messaging host functionality"""
    from native_messaging_host import main as native_messaging_main

    native_messaging_main()


def ensure_native_messaging_host_registered(native_messaging_script_path):
    """Ensure the native messaging host manifest is registered with Chrome"""
    try:
        # Log environment information
        logger = logging.getLogger("ai.inten.inten.native_messaging")
        logger.info("=== Native Messaging Host Registration ===")
        logger.info(f"Current working directory: {os.getcwd()}")
        logger.info(f"User: {os.getenv('USER')}")
        logger.info(f"Home directory: {os.path.expanduser('~')}")
        logger.info(f"Process ID: {os.getpid()}")
        logger.info(f"Parent Process ID: {os.getppid()}")
        logger.info(f"Environment variables: {dict(os.environ)}")

        # Only need manifest directory now
        manifest_dir = os.path.expanduser(
            "~/Library/Application Support/Google/Chrome/NativeMessagingHosts"
        )

        # Create manifest directory
        os.makedirs(manifest_dir, exist_ok=True)

        # Create and write manifest file
        logger.info(f"Target manifest directory: {manifest_dir}")

        # Create manifest content
        manifest = {
            "name": "ai.inten.app",
            "description": "Inten native messaging host",
            "path": native_messaging_script_path,
            "type": "stdio",
            "allowed_origins": ["chrome-extension://jgfjmabgdpbccfecnilbjnjoglnholem/"],
        }

        # Create a temporary manifest file
        import tempfile

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False
        ) as temp_file:
            json.dump(manifest, temp_file, indent=2)
            temp_path = temp_file.name
            logger.info(f"Created temporary manifest at: {temp_path}")

        # Try to create manifest directory and copy file
        try:
            manifest_path = os.path.join(manifest_dir, "ai.inten.app.json")

            # First try without sudo
            try:
                os.makedirs(manifest_dir, exist_ok=True)
                import shutil

                shutil.copy2(temp_path, manifest_path)
                os.chmod(manifest_path, 0o644)
                logger.info(
                    "Native messaging host manifest registered successfully without sudo"
                )
            except PermissionError as e:
                # If that fails, try with osascript to get sudo access
                logger.info(
                    f"Permission denied, attempting to register with osascript... Error: {str(e)}"
                )
                import subprocess

                # Create an AppleScript that will handle the sudo commands
                script = f"""
                do shell script "mkdir -p '{manifest_dir}' && cp '{temp_path}' '{manifest_path}' && chmod 644 '{manifest_path}'" with administrator privileges
                """

                try:
                    result = subprocess.run(
                        ["osascript", "-e", script], capture_output=True, text=True
                    )
                    if result.returncode == 0:
                        logger.info(
                            "Native messaging host manifest registered successfully with osascript"
                        )
                    else:
                        logger.error(f"osascript failed: {result.stderr}")
                        raise subprocess.CalledProcessError(
                            result.returncode,
                            ["osascript"],
                            result.stdout,
                            result.stderr,
                        )
                except subprocess.CalledProcessError as e:
                    logger.error(f"Failed to register with osascript: {e}")
                    raise
        finally:
            # Clean up temporary file
            try:
                os.unlink(temp_path)
                logger.info("Cleaned up temporary manifest file")
            except Exception as e:
                logger.error(f"Failed to clean up temporary file: {e}")

    except Exception as e:
        logger = logging.getLogger("ai.inten.inten.native_messaging")
        logger.error(f"Failed to register native messaging host manifest: {e}")
        logger.error("Chrome integration may not work properly")
        # Don't raise the exception - this is not critical for the app to function


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
        try:
            # Register native messaging host first
            ensure_native_messaging_host_registered(native_messaging_script_path)
        except Exception as e:
            logger.error(f"Failed to register native messaging host: {e}")
            # Continue anyway - this is not critical for the app to function

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

        # Create multiprocessing queues and event for keyboard listener
        event_queue = multiprocessing.Queue()
        status_queue = multiprocessing.Queue()
        stop_event = multiprocessing.Event()

        # Create and start the keyboard listener process
        logger.info("Creating keyboard listener process...")
        keyboard_listener = KeyboardListenerProcess(
            event_queue, status_queue, stop_event
        )
        keyboard_listener.start()
        logger.info("Keyboard listener process started")

        # Initialize keyboard manager with the queues
        logger.info("Initializing keyboard manager...")
        keyboard_manager = KeyboardManager.instance()
        logger.info("Keyboard manager instance created")
        if keyboard_manager.initialize(event_queue, status_queue):
            logger.info("Keyboard manager initialized successfully")
        else:
            logger.error("Failed to initialize keyboard manager")
        logger.debug("Debug test message after keyboard initialization")

        # Initialize theme manager from the containers
        logger.info("Initializing theme manager...")
        theme_manager = ThemeManager.instance()
        logger.info("Theme manager initialized")

        # Create and show the OnboardingWindow
        logger.info("Creating onboarding window...")
        onboarding_window = OnboardingWindow(
            theme_manager=theme_manager,
        )
        logger.info("Onboarding window created")
        onboarding_window.show()
        logger.info("Onboarding window shown")

        # Start the event loop
        logger.info("Starting application event loop...")
        try:
            sys.exit(app.exec())
        finally:
            # Clean up keyboard listener process
            logger.info("Cleaning up keyboard listener process...")
            stop_event.set()
            keyboard_listener.join(timeout=1.0)
            if keyboard_listener.is_alive():
                keyboard_listener.terminate()
            keyboard_listener.join()
            logger.info("Keyboard listener process cleaned up")

            # Clean up keyboard manager
            keyboard_manager.cleanup()

import json
import logging
import multiprocessing
import os
import platform
import signal
import sys
import traceback

import appnope
import sounddevice as sd
from PySide6.QtCore import QByteArray, Qt
from PySide6.QtGui import QFont, QIcon, QPainter, QPixmap
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtWidgets import QApplication, QMenu, QSystemTrayIcon

from src.application_manager import ApplicationManager
from src.ui.font.load_fonts import load_fonts
from src.ui.keyboard_listener import KeyboardListenerProcess
from src.ui.keyboard_manager import KeyboardManager
from src.ui.onboarding import OnboardingWindow
from src.ui.theme.manager import ThemeManager
from src.utils.logging import setup_logging

setup_logging()

logger = logging.getLogger(__name__)
logger.info("=== Application starting ===")
logger.info(f"Python version: {sys.version}")
logger.info(f"Platform: {platform.platform()}")
logger.info(f"Current directory: {os.getcwd()}")
logger.info(f"Script path: {os.path.abspath(__file__)}")
logger.debug("Debug logging enabled")

# Import NSProcessInfo for app nap prevention
if platform.system() == "Darwin":
    try:
        from Foundation import NSProcessInfo
    except ImportError:
        logger.warning(
            "Failed to import NSProcessInfo. App nap prevention will not be available."
        )

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
    from src.native_messaging_host import main as native_messaging_main

    native_messaging_main()


def ensure_native_messaging_host_registered(native_messaging_script_path):
    """Ensure the native messaging host manifest is registered with Chrome"""
    try:
        # Log environment information
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
            "name": "ai.ito.ito",
            "description": "Ito native messaging host",
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
            manifest_path = os.path.join(manifest_dir, "ai.ito.ito.json")

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
    # Prevent app nap on macOS
    if platform.system() == "Darwin":
        try:
            process_info = NSProcessInfo.processInfo()
            process_info.disableSuddenTermination()
            process_info.disableAutomaticTermination()
            appnope.nope()
            logger.info("App nap prevention enabled")
        except Exception as e:
            logger.warning(f"Failed to prevent app nap: {e}")

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
            "/Applications/Ito.app/Contents/Resources/native_messaging_host.sh"
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

        # Load and register fonts
        if load_fonts():
            # Set default font for the entire application
            font = QFont("Inter 18pt", 13)  # Use the actual font family name
            font.setStyleHint(QFont.StyleHint.SansSerif)
            app.setFont("Inter 18pt")
        else:
            logger.warning("Using system default font as Inter font loading failed")
            # Set a system font as fallback
            font = QFont()
            font.setStyleHint(QFont.StyleHint.SansSerif)
            app.setFont(font)

        # Initialize theme manager
        theme_manager = ThemeManager.instance()

        # Create system tray icon
        tray_icon = QSystemTrayIcon()
        tray_icon.setToolTip("Ito")

        # Create tray menu
        tray_menu = QMenu()
        quit_action = tray_menu.addAction("Quit")
        quit_action.triggered.connect(app.quit)
        tray_icon.setContextMenu(tray_menu)

        # Set icon using theme manager's SVG
        fill_color = "white" if theme_manager.current_theme == "dark" else "black"
        svg_content = theme_manager.get_logo_svg_content(fill_color)
        if svg_content:
            # Create a QByteArray from the SVG content
            svg_data = QByteArray(svg_content.encode("utf-8"))

            # Create a renderer and pixmap
            renderer = QSvgRenderer(svg_data)
            pixmap = QPixmap(32, 32)  # Standard tray icon size
            pixmap.fill(Qt.transparent)

            # Render the SVG onto the pixmap
            painter = QPainter(pixmap)
            renderer.render(painter)
            painter.end()

            tray_icon.setIcon(QIcon(pixmap))
        else:
            # Use a default icon if SVG processing fails
            tray_icon.setIcon(QIcon.fromTheme("application-x-executable"))

        # Show the tray icon
        tray_icon.show()

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

        # Initialize ApplicationManager
        app_manager = ApplicationManager(
            OnboardingWindow.ORGANIZATION_NAME, OnboardingWindow.APPLICATION_NAME
        )

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

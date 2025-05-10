import json
import logging
import multiprocessing
import os
import platform
import signal
import sys
import traceback

import sounddevice as sd
from PyQt6.QtWidgets import QApplication

from src.ui.keyboard_manager import KeyboardManager
from src.ui.onboarding import OnboardingWindow

multiprocessing.freeze_support()

if platform.system() == "Darwin":
    try:
        from src import platform_utils_macos as platform_utils
    except ImportError:
        print("WARNING: Running on macOS but failed to import 'platform_utils_macos'. OS interaction will fail.")
        class PlatformUtilsDummy:
            def is_macos(self): return True
            def get_active_window_info(self): print("Error: platform_utils_macos import failed."); return None
            def get_textedit_content(self): print("Error: platform_utils_macos import failed."); return None
            def set_textedit_content(self, text): print("Error: platform_utils_macos import failed."); return False
        platform_utils = PlatformUtilsDummy()
else:
    print(f"Running on {platform.system()}. OS-specific interactions limited.")
    class PlatformUtilsDummy:
        def is_macos(self): return False
        def get_active_window_info(self): print("Warning: OS interaction not supported on this platform."); return None
        def get_textedit_content(self): print("Warning: TextEdit interaction not supported."); return None
        def set_textedit_content(self, text): print("Warning: TextEdit interaction not supported."); return False
    platform_utils = PlatformUtilsDummy()

def check_microphone_permission():
    """Check if microphone permission is granted and request it if needed."""
    try:
        # Try to query the default input device - this triggers permission check
        device_info = sd.query_devices(kind='input')
        print(f"Microphone permission granted - found device: {device_info['name']}")
        return True
    except sd.PortAudioError as e:
        print(f"Microphone permission error: {e}")
        return False
    except Exception as e:
        print(f"Unexpected error checking microphone: {e}")
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
        manifest_dir = os.path.expanduser("~/Library/Application Support/Google/Chrome/NativeMessagingHosts")
        
        # Create manifest directory
        os.makedirs(manifest_dir, exist_ok=True)
        
        # Create and write manifest file
        manifest = {
            "name": "ai.inten.app",
            "description": "Inten native messaging host",
            "path": native_messaging_script_path,
            "type": "stdio",
            "allowed_origins": [
                "chrome-extension://jgfjmabgdpbccfecnilbjnjoglnholem/"
            ]
        }
        print("creating manifest:", manifest)

        manifest_path = os.path.join(manifest_dir, "ai.inten.app.json")
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)
            
        # Set manifest permissions
        os.chmod(manifest_path, 0o644)
            
        logging.info("Native messaging host manifest registered successfully")
        
    except Exception as e:
        logging.error(f"Failed to register native messaging host manifest: {e}")

# --- Signal Handlers ---
def signal_handler(signum, frame):
    """Handle termination signals gracefully."""
    print(f"\nReceived signal {signum}. Initiating graceful shutdown...")
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
    dev_mode = os.getenv('DEV')
    if dev_mode:
        print("Dev mode enabled")
        current_dir = os.path.dirname(os.path.abspath(__file__))
        native_messaging_script_path = os.path.join(current_dir, "native_messaging_host.sh")
    else:
        print("Dev mode disabled")
        native_messaging_script_path = "/Applications/Inten.app/Contents/Resources/native_messaging_host.sh"

    if len(sys.argv) > 1 and sys.argv[1] == "--native-messaging-host":
        print("Starting native messaging host...")
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
            print("Warning: Microphone permission not granted. The app may not function properly.")
            print("Please grant microphone access in System Settings > Privacy & Security > Microphone")
        
        # Initialize keyboard manager (without setting hotkey yet)
        keyboard_manager = KeyboardManager.instance()
        keyboard_manager.initialize_listener()
        
        # Create and show the OnboardingWindow
        onboarding_window = OnboardingWindow()
        onboarding_window.show()
        
        # Start the event loop
        sys.exit(app.exec())
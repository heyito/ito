import sys
import os
import time
import platform
import json
import logging
from pynput import keyboard
import traceback    
import signal
from src.ui.onboarding import OnboardingWindow
from PyQt6.QtWidgets import QApplication
from PyQt6.QtCore import QTimer, QThread
import threading
import multiprocessing

multiprocessing.freeze_support()

# Import platform utils conditionally
if platform.system() == "Darwin":
    try:
        from src import platform_utils_macos as platform_utils
        print("macOS detected. Loading macOS platform utilities.")
    except ImportError:
        print("WARNING: Running on macOS but failed to import 'platform_utils_macos'. OS interaction will fail.")
        # Define dummy class to avoid errors later if import failed
        class PlatformUtilsDummy:
            def is_macos(self): return True # Pretend it is for checks
            def get_active_window_info(self): print("Error: platform_utils_macos import failed."); return None
            def get_textedit_content(self): print("Error: platform_utils_macos import failed."); return None
            def set_textedit_content(self, text): print("Error: platform_utils_macos import failed."); return False
        platform_utils = PlatformUtilsDummy()

else:
    # Define dummy functions or raise error if not macOS
    print(f"Running on {platform.system()}. OS-specific interactions limited.")
    class PlatformUtilsDummy:
        def is_macos(self): return False
        def get_active_window_info(self): print("Warning: OS interaction not supported on this platform."); return None
        def get_textedit_content(self): print("Warning: TextEdit interaction not supported."); return None
        def set_textedit_content(self, text): print("Warning: TextEdit interaction not supported."); return False
    platform_utils = PlatformUtilsDummy()

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
        
        # Create and show the OnboardingWindow
        onboarding_window = OnboardingWindow()
        onboarding_window.show()
        
        # Start the event loop
        sys.exit(app.exec())
from src.apps.notes import NotesApp
from src.constants import SOCKET_PATH
from src.types.apps import IntenApp
from src import platform_utils_macos as platform_utils
from src.apps.text_edit import TextEditApp
from src.apps.google_chrome import GoogleChromeApp

class ContextEngine:
    def __init__(self, text_edit_app: TextEditApp, google_chrome_app: GoogleChromeApp, notes_app: NotesApp):
        self.text_edit_app = text_edit_app
        self.google_chrome_app = google_chrome_app
        self.notes_app = notes_app

    def get_context(self, current_context: dict):
        if platform_utils.is_macos():
            if current_context['app_name'] == IntenApp.TEXTEDIT:
                return self.text_edit_app.get_context()
            elif current_context['app_name'] == IntenApp.CHROME:
                return self.google_chrome_app.get_context()
            elif current_context['app_name'] == IntenApp.NOTES:
                return self.notes_app.get_context()
            else:
                    print(f"Info: Active application ({current_context['app_name']}) is not supported. Currently supported: TextEdit and Google Chrome.")
                    return
        else:
            print("Info: Not running on macOS, cannot get application context.")
            return

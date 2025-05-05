from src import platform_utils_macos as platform_utils
from src.apps.browser import BrowserApp
from src.apps.macos import MacOSapp
from src.apps.notes import NotesApp
from src.apps.text_edit import TextEditApp
from src.types.apps import IntenApp


class ContextEngine:
    def __init__(self, text_edit_app: TextEditApp, browser_app: BrowserApp, notes_app: NotesApp, macos_app: MacOSapp):
        self.text_edit_app = text_edit_app
        self.browser_app = browser_app
        self.notes_app = notes_app
        self.macos_app = macos_app

    def get_context(self, current_context: dict):
        if platform_utils.is_macos():
            if current_context['app_name'] == IntenApp.TEXTEDIT:
                return self.text_edit_app.get_context()
            elif current_context['app_name'] == IntenApp.CHROME:
                return self.browser_app.get_context()
            else:
                return self.macos_app.get_context()
        else:
            print("Info: Not running on macOS, cannot get application context.")
            return

from rich import print as rprint

from src.apps.browser import BrowserApp
from src.apps.macos import MacOSapp
from src.apps.notes import NotesApp
from src.apps.text_edit import TextEditApp
from src.types.apps import ItoApp
from src.types.context import Context
from src.utils import platform_utils_macos as platform_utils


class ContextEngine:
    def __init__(
        self,
        text_edit_app: TextEditApp,
        browser_app: BrowserApp,
        notes_app: NotesApp,
        macos_app: MacOSapp,
    ):
        self.text_edit_app = text_edit_app
        self.browser_app = browser_app
        self.notes_app = notes_app
        self.macos_app = macos_app

    def get_full_app_context(self, current_context: Context):
        app_name = current_context.get("app_name", None)
        if platform_utils.is_macos():
            match app_name:
                case ItoApp.TEXTEDIT:
                    return self.text_edit_app.get_context()
                case ItoApp.CHROME | ItoApp.BRAVE:
                    if self.browser_app.extension_connected:
                        return self.browser_app.get_context()
                    else:
                        return self.macos_app.get_context()
                case _:
                    return self.macos_app.get_context()
        else:
            print("Info: Not running on macOS, cannot get application context.")
            return

    def get_focused_cursor_context(self, current_context: dict):
        """
        Returns the text at the current cursor position in the active application.
        """
        app_name = current_context.get("app_name", None)
        if platform_utils.is_macos():
            match app_name:
                case ItoApp.CHROME | ItoApp.BRAVE:
                    if self.browser_app.extension_connected:
                        return ""
                    else:
                        return self.macos_app.get_focused_cursor_context()
                case ItoApp.TEXTEDIT:
                    return self.text_edit_app.get_context()
                case _:
                    context = self.macos_app.get_focused_cursor_context()
                    rprint(
                        f"[bold magenta]Focused cursor context: {context} [/bold magenta]"
                    )
                    return context
        else:
            print("Info: Not running on macOS, cannot get application context.")
            return

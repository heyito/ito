
from src.apps.browser import BrowserApp
from src.apps.macos import MacOSapp
from src.apps.notes import NotesApp
from src.apps.text_edit import TextEditApp
from src.types.apps import IntenApp


class ProcessingEngine:
    def __init__(self, config, browser_app: BrowserApp, text_edit_app: TextEditApp, notes_app: NotesApp, macos_app: MacOSapp):
        self.config = config
        self.browser_app = browser_app
        self.text_edit_app = text_edit_app
        self.notes_app = notes_app
        self.macos_app = macos_app
        
    def process(self, current_context: dict, processing_text: str, user_command: str):
        print(f"\033[1m\033[34mProcessing command: '{user_command}'\033[0m")
        print(f"On document context (length: {len(processing_text)} chars)")

        # 1. Construct LLM Prompt
        print("Constructing LLM prompt with distinct markers...")
        
        current_app = current_context.get("app_name").strip()
        print(f"Current app: {repr(current_app)}")
        if current_app == IntenApp.CHROME or current_app == IntenApp.BRAVE:
            print("Processing command with Browser app...")
            self.browser_app.process_command(processing_text, user_command)
        elif current_app == IntenApp.TEXTEDIT:
            self.text_edit_app.process_command(processing_text, user_command)
        else:
            self.macos_app.process_command(current_app, processing_text, user_command)

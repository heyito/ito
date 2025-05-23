import logging

from rich import print as rprint

from src.apps.browser import BrowserApp
from src.apps.macos import MacOSapp
from src.apps.notes import NotesApp
from src.apps.text_edit import TextEditApp
from src.types.apps import IntenApp

# Configure logging
logger = logging.getLogger(__name__)


class ProcessingEngine:
    def __init__(
        self,
        config,
        browser_app: BrowserApp,
        text_edit_app: TextEditApp,
        notes_app: NotesApp,
        macos_app: MacOSapp,
    ):
        self.config = config
        self.browser_app = browser_app
        self.text_edit_app = text_edit_app
        self.notes_app = notes_app
        self.macos_app = macos_app

    def process_action(
        self,
        current_context: dict,
        processing_text: str,
        user_text_command: str,
        user_command_audio: bytes | None = None,
    ):
        rprint(f"[bold blue]Processing action: '{user_text_command}'[/bold blue]")
        logger.info(f"On document context (length: {len(processing_text)} chars)")

        # 1. Construct LLM Prompt
        logger.info("Constructing LLM prompt with distinct markers...")

        current_app = current_context.get("app_name").strip()
        logger.info(f"Current app: {repr(current_app)}")

        match current_app:
            case IntenApp.TEXTEDIT:
                self.text_edit_app.process_command(
                    processing_text, user_text_command, user_command_audio
                )
            case IntenApp.CHROME | IntenApp.BRAVE:
                self.browser_app.process_command(
                    processing_text, user_text_command, user_command_audio
                )
            case _:
                self.macos_app.process_action(
                    current_app, processing_text, user_text_command, user_command_audio
                )

    def process_dictation(
        self,
        current_context: dict,
        processing_text: str,
        user_text_command: str,
        user_command_audio: bytes | None = None,
    ):
        rprint(f"[bold blue]Processing dictation: '{user_text_command}'[/bold blue]")
        current_app = current_context.get("app_name").strip()

        match current_app:
            case IntenApp.CHROME | IntenApp.BRAVE:
                self.browser_app.process_command(
                    processing_text, user_text_command, user_command_audio
                )
            case IntenApp.TEXTEDIT:
                self.text_edit_app.process_command(
                    processing_text, user_text_command, user_command_audio
                )
            case _:
                self.macos_app.process_dictation(
                    current_app, processing_text, user_text_command, user_command_audio
                )

import logging

from rich import print as rprint

from src.apps.browser import BrowserApp
from src.apps.macos import MacOSapp
from src.apps.notes import NotesApp
from src.apps.text_edit import TextEditApp
from src.types.apps import ItoApp
from src.types.context import Context

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
        current_context: Context,
        user_text_command: str,
        user_command_audio: bytes | None = None,
    ):
        primary_context = current_context["primary_context"]
        rprint(f"[bold blue]Processing action: '{user_text_command}'[/bold blue]")
        logger.info(f"On document context (length: {len(primary_context)} chars)")

        # 1. Construct LLM Prompt
        logger.info("Constructing LLM prompt with distinct markers...")

        current_app = current_context.get("app_name").strip()
        logger.info(f"Current app: {repr(current_app)}")

        match current_app:
            case ItoApp.TEXTEDIT:
                self.text_edit_app.process_command(
                    primary_context, user_text_command, user_command_audio
                )
            case ItoApp.CHROME | ItoApp.BRAVE:
                if self.browser_app.extension_connected:
                    self.browser_app.process_command(
                        current_context["page_context"],
                        user_text_command,
                        user_command_audio,
                    )
                else:
                    self.macos_app.process_action(
                        current_context,
                        user_text_command,
                        user_command_audio,
                    )
            case _:
                self.macos_app.process_action(
                    primary_context, user_text_command, user_command_audio
                )

    def process_dictation(
        self,
        current_context: Context,
        user_text_command: str,
        user_command_audio: bytes | None = None,
    ):
        rprint(f"[bold blue]Processing dictation: '{user_text_command}'[/bold blue]")
        current_app = current_context.get("app_name").strip()
        primary_context = current_context["primary_context"]

        match current_app:
            case ItoApp.CHROME | ItoApp.BRAVE:
                if self.browser_app.extension_connected:
                    self.browser_app.process_command(
                        current_context["page_context"],
                        user_text_command,
                        user_command_audio,
                    )
                else:
                    self.macos_app.process_dictation(
                        current_context,
                        user_text_command,
                        user_command_audio,
                    )
            case ItoApp.TEXTEDIT:
                self.text_edit_app.process_command(
                    primary_context, user_text_command, user_command_audio
                )
            case _:
                # Remove accessibility elements and OCR texts from page context
                # Currently too many input tokens for the LLM
                current_context["page_context"].pop("accessibility_elements", None)
                current_context["page_context"].pop("ocr_texts", None)

                self.macos_app.process_dictation(
                    current_context,
                    user_text_command,
                    user_command_audio,
                )

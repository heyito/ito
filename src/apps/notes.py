import logging

import src.utils.platform_utils_macos as platform_utils
from src.handlers.llm_handler import LLMHandler
from src.prompts import prompt_templates

# Configure logging
logger = logging.getLogger(__name__)


class NotesApp:
    system_prompt = prompt_templates.PAGE_EDITOR_SYSTEM_PROMPT

    def __init__(self, llm_handler: LLMHandler):
        self.llm_handler = llm_handler

    def get_context(self):
        logger.info("NotesApp: Getting context")
        content = platform_utils.get_notes_content()
        return content

    def process_command(
        self,
        processing_text: str,
        user_text_command: str,
        user_command_audio: bytes | None = None,
    ):
        full_llm_input = prompt_templates.create_notes_prompt(
            content=processing_text, command=user_text_command
        )

        new_doc_text = self.llm_handler.process_input_with_llm(
            text=full_llm_input,  # Pass combined context+command as user message content
            audio_buffer=user_command_audio,
            system_prompt_override=self.system_prompt,  # Pass the system prompt from config
        )

        if new_doc_text is None:  # Check for None specifically
            logger.error("LLM processing failed or did not return content.")
            # is_processing is released in finally block
            return  # Exit processing early

        logger.info(
            f"LLM returned new document content (length: {len(new_doc_text)} chars)."
        )

        logger.info("Attempting to replace content in Notes via AppleScript...")
        success = platform_utils.set_notes_content(new_doc_text)

        if success:
            logger.info("Successfully updated Notes document.")
        else:
            logger.error("Failed to update Notes document via AppleScript.")

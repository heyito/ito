import logging

from src.utils import platform_utils_macos as platform_utils
from src.handlers.llm_handler import LLMHandler
from src.prompts import prompt_templates

# Configure logging
logger = logging.getLogger(__name__)


class TextEditApp:
    system_prompt = prompt_templates.PAGE_EDITOR_SYSTEM_PROMPT

    def __init__(self, llm_handler: LLMHandler):
        self.llm_handler = llm_handler

    def process_command(
        self,
        primary_context: str,
        user_text_command: str,
        user_command_audio: bytes | None = None,
    ):
        full_llm_input = prompt_templates.create_general_document_body_prompt(
            application="TextEdit", content=primary_context, command=user_text_command
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
        # Optional: Add more verbose logging for debugging
        logger.debug(f"LLM Output Snippet:\n---\n{new_doc_text[:200]}...\n---")

        logger.info("Attempting to replace content in TextEdit via AppleScript...")
        success = platform_utils.set_textedit_content(new_doc_text)

        if success:
            logger.info("Successfully updated TextEdit document.")
        else:
            logger.error("Failed to update TextEdit document via AppleScript.")

    def get_context(self):
        logger.info("Getting content from TextEdit...")
        context = platform_utils.get_textedit_content()
        if context is None:
            logger.error(
                "Error: Failed to get text from TextEdit (is a document open and frontmost?). Aborting."
            )
            return  # Do not proceed without context
        logger.info(f"Obtained TextEdit content (length: {len(context)} chars).")
        return context

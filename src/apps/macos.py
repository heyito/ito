from src import prompt_templates
from src.handlers.llm_handler import LLMHandler
import src.platform_utils_macos as platform_utils

class MacOSapp: 
    system_prompt = prompt_templates.PAGE_EDITOR_SYSTEM_PROMPT
    def __init__(self, llm_handler: LLMHandler):
        self.llm_handler = llm_handler

    def get_context(self, app_name: str):
        context = platform_utils.get_active_body(app_name)
        return context

    def process_command(self, app_name: str, processing_text: str, user_command: str):
        full_llm_input = prompt_templates.create_general_document_body_prompt(
            application=app_name,
            content=processing_text,
            command=user_command
        )

        new_doc_text = self.llm_handler.process_text_with_llm(
            text=full_llm_input, # Pass combined context+command as user message content
            system_prompt_override=self.system_prompt, # Pass the system prompt from config
        )

        if new_doc_text is None: # Check for None specifically
            print("LLM processing failed or did not return content.")
            # is_processing is released in finally block
            return # Exit processing early
        
        success = platform_utils.set_active_body(app_name, new_doc_text)

        if success:
            print(f"Successfully updated {app_name} document.")
        else:
            print(f"Failed to update {app_name} document via AppleScript.")


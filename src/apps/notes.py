from src import prompt_templates
from src.handlers.llm_handler import LLMHandler
import src.platform_utils_macos as platform_utils
class NotesApp:
    system_prompt = prompt_templates.PAGE_EDITOR_SYSTEM_PROMPT
    
    def __init__(self, llm_handler: LLMHandler):
        self.llm_handler = llm_handler

    def get_context(self):
        print("NotesApp: Getting context")
        content = platform_utils.get_notes_content()
        return content
    
    def process_command(self, processing_text: str, user_command: str):
        print("NotesApp: Not implemented yet -- passing")
        full_llm_input = prompt_templates.create_notes_prompt(
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
        
        print(f"LLM returned new document content (length: {len(new_doc_text)} chars).")

        print("Attempting to replace content in Notes via AppleScript...")
        success = platform_utils.set_notes_content(new_doc_text)

        if success:
            print("Successfully updated Notes document.")
        else:
            print("Failed to update Notes document via AppleScript.")

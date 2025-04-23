from src import prompt_templates
from src import platform_utils_macos as platform_utils
from src.llm_handler import LLMHandler

class TextEditApp:
    system_prompt = prompt_templates.PAGE_EDITOR_SYSTEM_PROMPT

    def __init__(self, llm_handler: LLMHandler):
        self.llm_handler = llm_handler
    
    def process_command(self, processing_text: str, user_command: str):
        full_llm_input = prompt_templates.create_textedit_prompt(
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
        # Optional: Add more verbose logging for debugging
        print(f"LLM Output Snippet:\n---\n{new_doc_text[:200]}...\n---")

        print("Attempting to replace content in TextEdit via AppleScript...")
        success = platform_utils.set_textedit_content(new_doc_text)

        if success:
            print("Successfully updated TextEdit document.")
        else:
            print("Failed to update TextEdit document via AppleScript.")


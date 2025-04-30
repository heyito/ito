import json
from src import prompt_templates
from src.engines.macos_engine import MacOSEngine
from src.handlers.llm_handler import LLMHandler
import src.platform_utils_macos as platform_utils

class MacOSapp: 
    system_prompt = prompt_templates.MACOS_AX_OCR_SYSTEM_PROMPT

    def __init__(self, llm_handler: LLMHandler, macos_engine: MacOSEngine):
        self.llm_handler = llm_handler
        self.macos_engine = macos_engine
        
    def get_context(self):
        context = self.macos_engine.get_active_window_info()
        return context

    """
    Process the command and update the document.

    args:
        app_name: str - The name of the application to process the command for
        processing_text: str - The json representation of the context from above
        user_command: str - The command to process
    """
    def process_command(self, app_name: str, processing_text: str, user_command: str):
        full_llm_input = prompt_templates.create_macos_ax_ocr_prompt(
            context=processing_text,
            command=user_command
        )

        response = self.llm_handler.process_text_with_llm(
            text=full_llm_input, # Pass combined context+command as user message content
            system_prompt_override=self.system_prompt, # Pass the system prompt from config
        )

        if response is None: # Check for None specifically
            print("LLM processing failed or did not return content.")
            # is_processing is released in finally block
            return # Exit processing early
        
        result = json.loads(response)

        print(f"Result: {result}")

        if result['action'] == 'none':
            print("No action to take.")
            return
        elif result['action'] == 'click':
            self.macos_engine.click_at_global(result['x'], result['y'])
        elif result['action'] == 'type_text':
            self.macos_engine.type_text_global(result['x'], result['y'], result['text'])
        else:
            print(f"Unknown action: {result['action']}")
            raise Exception(f"Unknown action: {result['action']}")


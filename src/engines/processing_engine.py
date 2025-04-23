
from src.apps.google_chrome import GoogleChromeApp
from src.apps.text_edit import TextEditApp
from src.constants import SOCKET_PATH
from src.types.apps import IntenApp

class ProcessingEngine:
    def __init__(self, config, google_chrome_app: GoogleChromeApp, text_edit_app: TextEditApp):
        self.config = config
        self.google_chrome_app = google_chrome_app
        self.text_edit_app = text_edit_app

    def process(self, current_context: dict, processing_text: str, user_command: str):
        print(f"Processing command: '{user_command}'")
        print(f"On document context (length: {len(processing_text)} chars)")

        # 1. Construct LLM Prompt
        print("Constructing LLM prompt with distinct markers...")
        
        if current_context.get("app_name") == IntenApp.CHROME:
            self.google_chrome_app.process_command(processing_text, user_command)
        elif current_context.get("app_name") == IntenApp.NOTES:
            # try: 
            #     notes_json = json.loads(processing_text)
            #     full_llm_input = prompt_templates.create_notes_prompt(
            #         notes_json=notes_json,
            #         command=user_command
            #     )
            #     llm_system_prompt = prompt_templates.NOTES_SYSTEM_PROMPT
            # except json.JSONDecodeError:
            #     print("Error: Failed to parse Notes JSON. Using text content only.")
            #     full_llm_input = prompt_templates.create_notes_prompt(
            #         notes_text=processing_text,
            #         command=user_command
            #     )'
            pass
        else:
            # Defaults to TextEdit
            # TODO: Make more robust
            self.text_edit_app.process_command(processing_text, user_command)

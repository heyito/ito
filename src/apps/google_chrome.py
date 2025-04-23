import json
import socket

from src import prompt_templates
from src.constants import SOCKET_PATH
from src.llm_handler import LLMHandler


class GoogleChromeApp:
    system_prompt = prompt_templates.PAGE_EDITOR_SYSTEM_PROMPT

    def __init__(self, llm_handler: LLMHandler):
        self.llm_handler = llm_handler

    def process_command(self, processing_text: str, user_command: str):
        # Parse the text as JSON if it's from Chrome
        full_llm_input = ""
        try:
            chrome_context = json.loads(processing_text)
            print(f"Chrome context: {chrome_context}")
            
            # Get the active element content
            content = prompt_templates.get_active_element_content(chrome_context)
            
            # Create the prompt using the template
            full_llm_input = prompt_templates.create_chrome_prompt(
                url=chrome_context.get('url', ''),
                title=chrome_context.get('title', ''),
                content=content,
                command=user_command,
                selected_text=chrome_context.get('selectedText')
            )
        except json.JSONDecodeError:
            # Fallback if the text isn't valid JSON
            full_llm_input = f"""[START CURRENT DOCUMENT CONTENT]
                {processing_text}
                [END CURRENT DOCUMENT CONTENT]

                [USER COMMAND]
                {user_command}
            """

        # 2. Process with LLM
        new_doc_text = self.llm_handler.process_text_with_llm(
            text=full_llm_input, # Pass combined context+command as user message content
            system_prompt_override=self.system_prompt, # Pass the system prompt from config
            # Note: llm_handler needs modification if it doesn't support system_prompt_override
            # Or adjust here to send a single combined prompt string if handler only takes 'text'
        )

        if new_doc_text is None: # Check for None specifically
            print("LLM processing failed or did not return content.")
            # is_processing is released in finally block
            return # Exit processing early
        
        print(f"LLM returned new document content (length: {len(new_doc_text)} chars).")
        # Optional: Add more verbose logging for debugging
        print(f"LLM Output Snippet:\n---\n{new_doc_text[:200]}...\n---")

        print("Sending text update to Chrome extension...")
        try:
            # Connect to the native messaging host socket
            client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            client.connect(SOCKET_PATH)
            
            # Send the message to update text
            message = {
                "type": "insert_text",
                "text": new_doc_text
            }
            client.send(json.dumps(message).encode())
            client.close()
            print("Successfully sent text update to Chrome extension")
        except Exception as e:
            print(f"Error sending text update to Chrome extension: {e}")




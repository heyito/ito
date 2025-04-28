import json
import socket
import threading
import queue

from src import prompt_templates
from src.constants import SOCKET_PATH
from src.handlers.llm_handler import LLMHandler
from src import platform_utils_macos as platform_utils

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

    def get_context(self):
        print("Getting content from Chrome...")
        # Request context from Chrome extension with timeout
        try:
            result_queue = queue.Queue()

            def get_chrome_context_with_timeout():
                try:
                    chrome_context = platform_utils.get_chrome_context(SOCKET_PATH)
                    result_queue.put(chrome_context)
                except Exception as e:
                    result_queue.put(e)

            # Start the context fetching in a separate thread
            context_thread = threading.Thread(target=get_chrome_context_with_timeout)
            context_thread.daemon = True
            context_thread.start()

            # Wait for the result with a 5-second timeout
            try:
                result = result_queue.get(timeout=5)
                if isinstance(result, Exception):
                    raise result

                chrome_context = result
                print(f"Received Chrome context: {chrome_context}")
                
                if chrome_context is None:
                    print("Error: Failed to get context from Chrome. Aborting.")
                    return
                
                # Print the chrome context
                print(f"Chrome context: {chrome_context}")
                # Combine relevant context from Chrome
                original_doc_text_for_command = ""
                
                # Application context
                original_doc_text_for_command += "[APPLICATION]\nGoogle Chrome\n\n"
                
                # Page context
                if chrome_context.get('url') or chrome_context.get('title'):
                    original_doc_text_for_command += "[PAGE]\n"
                    if chrome_context.get('url'):
                        original_doc_text_for_command += f"{chrome_context['url']}\n"
                    if chrome_context.get('title'):
                        original_doc_text_for_command += f"{chrome_context['title']}\n"
                    original_doc_text_for_command += "\n"
                
                # Content context
                original_doc_text_for_command += "[START CURRENT DOCUMENT CONTENT]\n"
                
                # Handle contenteditable elements
                if chrome_context.get('activeElement', {}).get('isContentEditable'):
                    if chrome_context.get('activeElementValue'):
                        original_doc_text_for_command += f"{chrome_context['activeElementValue']}\n"
                
                # Handle regular input/textarea elements
                elif chrome_context.get('activeElement', {}).get('isTextInput'):
                    if chrome_context.get('activeElement', {}).get('value'):
                        original_doc_text_for_command += f"{chrome_context['activeElement']['value']}\n"
                
                # Add selected text if any
                if chrome_context.get('selectedText'):
                    original_doc_text_for_command += f"\nSelected text: {chrome_context['selectedText']}\n"
                
                original_doc_text_for_command += "\n[END CURRENT DOCUMENT CONTENT]\n"
                
                print(f"Obtained Chrome context (length: {len(original_doc_text_for_command)} chars).")
                
                return original_doc_text_for_command

            except queue.Empty:
                print("Error: Timed out while getting Chrome context. Aborting.")
                return
                
        except Exception as e:
            print(f"Error while getting Chrome context: {e}")
            return


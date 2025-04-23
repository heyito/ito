from src.constants import SOCKET_PATH
from src.types.apps import IntenApp
from src import platform_utils_macos as platform_utils

class ContextEngine:
    def __init__(self):
        self.context = {}

    def get_context(self, current_context: dict):
        if platform_utils.is_macos():
            if current_context['app_name'] == IntenApp.TEXTEDIT:
                print("Getting content from TextEdit...")
                original_doc_text_for_command = platform_utils.get_textedit_content()
                if original_doc_text_for_command is None:
                    print("Error: Failed to get text from TextEdit (is a document open and frontmost?). Aborting.")
                    return # Do not proceed without context
                print(f"Obtained TextEdit content (length: {len(original_doc_text_for_command)} chars).")
            elif current_context['app_name'] == IntenApp.CHROME:
                print("Getting content from Chrome...")
                # Request context from Chrome extension with timeout
                try:
                    import signal
                    from functools import wraps
                    import errno

                    def timeout_handler(signum, frame):
                        raise TimeoutError("Getting Chrome context timed out")

                    # Set the signal handler and a 5-second timeout
                    signal.signal(signal.SIGALRM, timeout_handler)
                    signal.alarm(5)  # 5 seconds

                    try:
                        chrome_context = platform_utils.get_chrome_context(SOCKET_PATH)
                        print(f"Received Chrome context: {chrome_context}")
                        signal.alarm(0)  # Disable the alarm
                        
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
                        
                    except TimeoutError:
                        print("Error: Timed out while getting Chrome context. Aborting.")
                        return
                    finally:
                        signal.alarm(0)  # Ensure the alarm is disabled
                        
                except Exception as e:
                    print(f"Error while getting Chrome context: {e}")
                    return
            elif current_context['app_name'] == IntenApp.NOTES:
                print("Getting content from Notes...")
                original_doc_text_for_command = platform_utils.get_notes_content()
                if original_doc_text_for_command is None:
                    print("Error: Failed to get text from Notes (is a document open and frontmost?). Aborting.")
                    return # Do not proceed without context
                print(f"Obtained Notes content (length: {len(original_doc_text_for_command)} chars).")
            else:
                    print(f"Info: Active application ({current_context['app_name']}) is not supported. Currently supported: TextEdit and Google Chrome.")
                    return
        else:
            print("Info: Not running on macOS, cannot get application context.")
            return

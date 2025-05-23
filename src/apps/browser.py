import json
import logging
import queue
import socket
import threading

from src import platform_utils_macos as platform_utils
from src import prompt_templates
from src.constants import SOCKET_PATH
from src.handlers.llm_handler import LLMHandler

logger = logging.getLogger(__name__)


class BrowserApp:
    system_prompt = prompt_templates.PAGE_EDITOR_SYSTEM_PROMPT

    def __init__(self, llm_handler: LLMHandler):
        self.llm_handler = llm_handler

    def process_command(
        self,
        processing_text: str,
        user_text_command: str,
        user_command_audio: bytes | None = None,
    ):
        # Parse the text as JSON if it's from Browser
        full_llm_input = ""
        try:
            browser_context = json.loads(processing_text)
            logger.info(f"Browser context: {browser_context}")

            # Get the active element content
            content = prompt_templates.get_active_element_content(browser_context)

            # Create the prompt using the template
            full_llm_input = prompt_templates.create_browser_prompt(
                url=browser_context.get("url", ""),
                title=browser_context.get("title", ""),
                content=content,
                command=user_text_command,
                selected_text=browser_context.get("selectedText"),
            )
        except json.JSONDecodeError:
            # Fallback if the text isn't valid JSON
            full_llm_input = f"""[START CURRENT DOCUMENT CONTENT]
                {processing_text}
                [END CURRENT DOCUMENT CONTENT]

                [USER COMMAND]
                {user_text_command}
            """

        # 2. Process with LLM
        new_doc_text = self.llm_handler.process_input_with_llm(
            text=full_llm_input,
            audio_buffer=user_command_audio,
            system_prompt_override=self.system_prompt,
        )

        if new_doc_text is None:
            logger.error("LLM processing failed or did not return content.")
            return

        logger.info(
            f"LLM returned new document content (length: {len(new_doc_text)} chars)."
        )
        logger.debug(f"LLM Output Snippet:\n---\n{new_doc_text[:200]}...\n---")

        logger.info("Sending text update to Browser extension...")
        try:
            # Connect to the native messaging host socket
            client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            client.connect(SOCKET_PATH)

            # Send the message to update text
            message = {"type": "insert_text", "text": new_doc_text}
            client.send(json.dumps(message).encode())
            client.close()
            logger.info("Successfully sent text update to Browser extension")
        except Exception as e:
            logger.error(f"Error sending text update to Browser extension: {e}")

    def get_context(self):
        logger.info("Getting content from Browser...")
        # Request context from Browser extension with timeout
        try:
            result_queue = queue.Queue()

            def get_browser_context_with_timeout():
                try:
                    browser_context = platform_utils.get_browser_context(SOCKET_PATH)
                    result_queue.put(browser_context)
                except Exception as e:
                    result_queue.put(e)

            # Start the context fetching in a separate thread
            context_thread = threading.Thread(target=get_browser_context_with_timeout)
            context_thread.daemon = True
            context_thread.start()

            # Wait for the result with a 5-second timeout
            try:
                result = result_queue.get(timeout=5)
                if isinstance(result, Exception):
                    raise result

                browser_context = result
                logger.info(f"Received Browser context: {browser_context}")

                if browser_context is None:
                    logger.error("Error: Failed to get context from Browser. Aborting.")
                    return

                # Print the browser context
                logger.info(f"Browser context: {browser_context}")
                # Combine relevant context from Browser
                original_doc_text_for_command = ""

                # Application context
                original_doc_text_for_command += "[APPLICATION]\nWebBrowser\n\n"

                # Page context
                if browser_context.get("url") or browser_context.get("title"):
                    original_doc_text_for_command += "[PAGE]\n"
                    if browser_context.get("url"):
                        original_doc_text_for_command += f"{browser_context['url']}\n"
                    if browser_context.get("title"):
                        original_doc_text_for_command += f"{browser_context['title']}\n"
                    original_doc_text_for_command += "\n"

                # Content context
                original_doc_text_for_command += "[START CURRENT DOCUMENT CONTENT]\n"

                # Handle contenteditable elements
                if browser_context.get("activeElement", {}).get("isContentEditable"):
                    if browser_context.get("activeElementValue"):
                        original_doc_text_for_command += (
                            f"{browser_context['activeElementValue']}\n"
                        )

                # Handle regular input/textarea elements
                elif browser_context.get("activeElement", {}).get("isTextInput"):
                    if browser_context.get("activeElement", {}).get("value"):
                        original_doc_text_for_command += (
                            f"{browser_context['activeElement']['value']}\n"
                        )

                original_doc_text_for_command += "\n[END CURRENT DOCUMENT CONTENT]\n"

                logger.info(
                    f"Obtained Browser context (length: {len(original_doc_text_for_command)} chars)."
                )

                return original_doc_text_for_command

            except queue.Empty:
                logger.error(
                    "Error: Timed out while getting Browser context. Aborting."
                )
                return

        except Exception as e:
            logger.error(f"Error while getting Browser context: {e}")
            return

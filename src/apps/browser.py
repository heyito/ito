import json
import logging
import queue
import socket
import threading
import time

from src import platform_utils_macos as platform_utils
from src.constants import SOCKET_PATH
from src.engines.macos_engine import MacOSEngine
from src.handlers.llm_handler import LLMHandler
from src.prompts import prompt_templates

logger = logging.getLogger(__name__)


class BrowserApp:
    system_prompt = prompt_templates.PAGE_EDITOR_SYSTEM_PROMPT

    def __init__(self, llm_handler: LLMHandler):
        self.llm_handler = llm_handler
        self.extension_connected = False
        self._last_pong_time = 0
        self._ping_thread = threading.Thread(target=self._ping_loop, daemon=True)
        self._ping_thread.start()

    def _ping_loop(self):
        while True:
            try:
                client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                client.settimeout(1.0)
                client.connect(SOCKET_PATH)
                client.send(json.dumps({"type": "ping"}).encode())
                try:
                    data = client.recv(4096)
                    if data:
                        msg = json.loads(data.decode())
                        if msg.get("type") == "pong":
                            self.extension_connected = True
                            self._last_pong_time = time.time()
                        else:
                            # Not a pong, treat as not connected
                            if time.time() - self._last_pong_time > 3:
                                self.extension_connected = False
                    else:
                        if time.time() - self._last_pong_time > 3:
                            self.extension_connected = False
                except socket.timeout:
                    if time.time() - self._last_pong_time > 3:
                        self.extension_connected = False
                finally:
                    client.close()
            except Exception:
                if time.time() - self._last_pong_time > 3:
                    self.extension_connected = False
            time.sleep(2)

    def process_command(
        self,
        browser_context: str,
        user_text_command: str,
        user_command_audio: bytes | None = None,
    ):
        # Parse the text as JSON if it's from Browser
        full_llm_input = ""
        try:
            logger.info(f"Processing object: {browser_context}")

            # Handle contenteditable elements
            active_element_content = browser_context["activeElementContent"]

            print("active_element_content", active_element_content)
            print("browser_context", browser_context)

            # Create the prompt using the template
            full_llm_input = prompt_templates.create_browser_prompt(
                url=browser_context.get("url", ""),
                title=browser_context.get("title", ""),
                content=active_element_content,
                command=user_text_command,
            )
        except json.JSONDecodeError as e:
            # Fallback if the text isn't valid JSON
            logger.warning("Falling back to generic handler for browser...", e)
            full_llm_input = f"""[START CURRENT DOCUMENT CONTENT]
                {browser_context}
                [END CURRENT DOCUMENT CONTENT]

                [USER COMMAND]
                {user_text_command}
            """

        # 2. Process with LLM
        print("full_llm_input", full_llm_input)
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
        if not self.extension_connected:
            logger.info(
                "Extension not connected (ping/pong state), using fallback handler."
            )
            engine = MacOSEngine()
            success = engine.paste_text_to_active_app(new_doc_text)
            if success:
                logger.info(
                    "Fallback: Successfully pasted text to active app using macOS engine."
                )
            else:
                logger.error(
                    "Fallback: Failed to paste text to active app using macOS engine."
                )
            return
        try:
            # Connect to the native messaging host socket
            client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            client.connect(SOCKET_PATH)
            message = {"type": "insert_text", "text": new_doc_text}
            client.send(json.dumps(message).encode())
            client.close()
            logger.info(
                "Sent text update to Browser extension (extension_connected=True)"
            )
        except Exception as e:
            logger.error(f"Error sending text update to Browser extension: {e}")
            logger.info("Falling back to generic handler (paste to active app)...")
            engine = MacOSEngine()
            success = engine.paste_text_to_active_app(new_doc_text)
            if success:
                logger.info(
                    "Fallback: Successfully pasted text to active app using macOS engine."
                )
            else:
                logger.error(
                    "Fallback: Failed to paste text to active app using macOS engine."
                )

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

            # Wait for the result with a 3-second timeout
            try:
                result = result_queue.get(timeout=3)
                if isinstance(result, Exception):
                    raise result

                browser_context = result
                logger.info(f"Received Browser context: {browser_context}")

                if browser_context is None:
                    logger.error("Error: Failed to get context from Browser. Aborting.")
                    return

                # Print the browser context
                logger.info(f"Browser context: {browser_context}")
                return browser_context

            except queue.Empty:
                logger.error(
                    "Error: Timed out while getting Browser context. Aborting."
                )
                return

        except Exception as e:
            logger.error(f"Error while getting Browser context: {e}")
            return

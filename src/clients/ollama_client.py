import json
import time
import logging
from typing import Any, List, Dict, Optional

import requests

from src.clients.llm_client_interface import LLMClientInterface
from src.utils.timing import time_method
from src.clients.types import ToolCallDict

logger = logging.getLogger(__name__)


class OllamaClient(LLMClientInterface):
    def __init__(self, model: str, base_url: str = "http://localhost:11434"):
        if not model:
            raise ValueError("Ollama model name is required.")
        self._model = model
        self._base_url = base_url.rstrip("/")
        self._is_running = False  # Checked by check_availability

    @property
    def source_name(self) -> str:
        return "ollama"

    @property
    def model_name(self) -> str:
        return self._model

    def _check_ollama_service(
        self, max_retries: int = 1, retry_delay: float = 1.0
    ) -> bool:
        """
        Low-level check if the Ollama service endpoint is responsive.
        """
        for attempt in range(max_retries):
            try:
                response = requests.get(f"{self._base_url}/api/tags", timeout=5)
                if response.status_code == 200:
                    return True
            except requests.exceptions.RequestException as e:
                if attempt < max_retries - 1:
                    logger.warning(
                        f"Attempt {attempt + 1}/{max_retries}: Ollama not responding at {self._base_url}, retrying in {retry_delay} seconds..."
                    )
                    time.sleep(retry_delay)
                else:
                    logger.error(
                        f"OllamaClient: Failed to connect to Ollama at {self._base_url} after {max_retries} attempts: {e}"
                    )
        return False

    def check_availability(self) -> bool:
        logger.info(
            f"OllamaClient: Checking availability for model '{self._model}' at {self._base_url}..."
        )
        if not self._check_ollama_service():
            logger.error(
                f"OllamaClient ERROR: Ollama service is not running or not accessible at {self._base_url}."
            )
            self._is_running = False
            return False

        # Optionally, check if the specific model is available
        try:
            response = requests.post(
                f"{self._base_url}/api/show", json={"name": self._model}, timeout=10
            )
            if response.status_code == 200:
                logger.info(f"OllamaClient: Model '{self._model}' is available.")
                self._is_running = True
                return True
            elif response.status_code == 404:
                logger.error(
                    f"OllamaClient ERROR: Model '{self._model}' not found in Ollama. Please pull it first."
                )
                self._is_running = False
                return False
            else:
                logger.warning(
                    f"OllamaClient WARNING: Received unexpected status {response.status_code} when checking for model '{self._model}'."
                )
                # Assuming service is running but model status is uncertain, proceed cautiously
                self._is_running = True  # Service is up, but model might fail later
                return True  # Or False, depending on how strict you want to be
        except requests.exceptions.RequestException as e:
            logger.error(
                f"OllamaClient: Error while checking model '{self._model}': {e}"
            )
            self._is_running = False  # Can't confirm model
            return False

    @time_method
    def generate_response(
        self,
        text: str,
        system_prompt: str,
        max_tokens: int,
        temperature: float,
        tool_functions: Optional[
            List[Dict]
        ] = None,  # Ollama doesn't directly support OpenAI tools this way
        messages_override: Optional[List[Dict]] = None,
    ) -> Optional[str]:
        if not self._is_running:  # Relies on check_availability being called
            logger.error(
                "OllamaClient ERROR: Ollama is not running or model not available. Cannot process request."
            )
            return None

        if tool_functions and len(tool_functions) > 0:
            logger.warning(
                "OllamaClient WARNING: 'tool_functions' parameter is provided, but Ollama client does not natively support OpenAI-style tools. Ignoring tools."
            )

        logger.info(f"Sending request to Ollama (model: {self._model})...")
        start_time = time.time()

        # Ollama's /api/generate typically works with a single prompt or a structured message list.
        # For simplicity here, we'll use the prompt approach.
        # If messages_override is provided, we need to adapt it to Ollama's expected format if it differs.
        # The current Ollama code uses a combined prompt.

        request_payload: Dict[str, Any]
        if messages_override:
            # Assuming messages_override is in OpenAI format, convert if necessary or ensure it's compatible.
            # For Ollama, you might send the whole list if the model supports it, or concatenate.
            # This example assumes /api/chat endpoint for messages, or /api/generate for prompt
            # The user's current code uses /api/generate with a formatted prompt. We'll stick to that.
            # If you switch Ollama to use /api/chat, this part would change.
            logger.info(
                "OllamaClient: Using messages_override. Formatting for Ollama prompt."
            )
            formatted_messages = ""
            for msg in messages_override:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                if role == "system":
                    formatted_messages += (
                        f"{content}\n\n"  # System prompt at the beginning
                    )
                else:
                    formatted_messages += f"{role.capitalize()}: {content}\n"
            # The 'text' parameter might be the latest user message, append it if not already in messages_override
            # This part needs clarification based on how messages_override is used.
            # For now, assume messages_override replaces the system_prompt + text logic.
            # If not, the logic for constructing full_prompt needs adjustment.
            # The current code in LLMHandler sends `messages_override or [system, user_text]`.
            # So if messages_override is present, it's the full conversation history.
            # Ollama's /api/generate doesn't directly take a message list in the same way as OpenAI.
            # It expects a "prompt" string.
            # We will format messages_override into a single prompt string.

            final_prompt_str = ""
            # Find system prompt in messages_override, if any
            system_msg_content = system_prompt  # Default
            user_msgs_formatted = []

            temp_messages = [m for m in messages_override]  # Create a mutable copy

            # Extract system prompt if present
            for i, msg in enumerate(temp_messages):
                if msg.get("role") == "system":
                    system_msg_content = msg.get("content", system_prompt)
                    temp_messages.pop(i)  # Remove it so it's not duplicated
                    break

            for msg in temp_messages:
                user_msgs_formatted.append(
                    f"{msg.get('role', 'user').capitalize()}: {msg.get('content', '')}"
                )

            full_prompt = (
                f"{system_msg_content}\n\n"
                + "\n".join(user_msgs_formatted)
                + "\nAssistant:"
            )

        else:
            full_prompt = f"{system_prompt}\n\nUser: {text}\nAssistant:"

        try:
            response = requests.post(
                f"{self._base_url}/api/generate",
                json={
                    "model": self._model,
                    "prompt": full_prompt,
                    "options": {
                        "temperature": temperature,
                        "num_predict": max_tokens,  # Ollama uses num_predict
                    },
                    "stream": True,  # Ollama generate API is often streamed
                },
                stream=True,
                timeout=120,  # seconds
            )
            response.raise_for_status()  # Raise HTTPError for bad responses (4xx or 5xx)

            full_response_content = ""
            for line in response.iter_lines():
                if line:
                    try:
                        chunk = json.loads(line.decode("utf-8"))
                        if "response" in chunk:
                            full_response_content += chunk["response"]
                        if chunk.get("done") and chunk.get("error"):
                            logger.error(
                                f"OllamaClient ERROR in stream: {chunk['error']}"
                            )
                            return None  # Or raise an exception
                    except json.JSONDecodeError:
                        logger.warning(
                            f"OllamaClient: Could not decode JSON line: {line}"
                        )
                        continue  # Skip malformed lines

            end_time = time.time()
            logger.info(f"Ollama response time: {end_time - start_time:.2f} seconds")
            logger.info(
                f"Ollama returned processed text: {full_response_content.strip()}"
            )
            return full_response_content.strip()

        except requests.exceptions.RequestException as e:
            logger.error(f"Error during Ollama LLM processing: {e}")
            import traceback

            logger.error(traceback.format_exc())
            return None
        except Exception as e:  # Catch other potential errors
            logger.error(
                f"An unexpected error occurred during Ollama LLM processing: {e}"
            )
            import traceback

            logger.error(traceback.format_exc())
            return None

    def generate_response_with_audio(
        self,
        audio_buffer: bytes,
        text: str,
        system_prompt: str,
        max_tokens: int,
        temperature: float,
        tools: list[dict] = [],
        messages_override: Optional[List[Dict]] = None,
    ) -> Any:
        raise NotImplementedError(
            "Ollama client does not support multi modal responses."
        )

    def format_system_user_messages(self, system_prompt: str, user_prompt: str):
        raise ValueError("OllamaClient does not support message formatting.")

    def format_tool_result_messages(self, id: str, name: str, args: dict, result: str):
        raise ValueError("OllamaClient does not support tools")

    def format_user_message(self, content: str):
        raise ValueError("OllamaClient does not support user message formatting.")

    def extract_tool_calls(self, response: Any) -> List[ToolCallDict] | None:
        raise ValueError("OllamaClient does not support tool calls")

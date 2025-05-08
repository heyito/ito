import time
from typing import Any, List, Dict, Optional

from src.clients.llm_client_interface import LLMClientInterface
from src.utils.timing import time_method

# Default System Prompt (can be configured or overridden)
DEFAULT_LLM_SYSTEM_PROMPT = "You are a helpful AI assistant."

class LLMHandler:
    def __init__(self, client: LLMClientInterface):
        """
        Initializes the LLMHandler with a specific LLM client.

        Args:
            client: An instance of a class that implements LLMClientInterface.
        """
        self.client = client
        self.is_client_available = self.client.check_availability()

        if self.is_client_available:
            print(f"LLMHandler initialized with client: {self.client.source_name}, model: {self.client.user_command_model_name}")
        else:
            print(f"LLMHandler WARNING: Client {self.client.source_name} is not available or not configured correctly.")

    @time_method
    def process_text_with_llm(
        self,
        text: str,
        system_prompt_override: Optional[str] = None, # Use Optional
        max_tokens: int = 4096,
        temperature: float = 0.7,
        tools: Optional[List[Dict]] = None, # Use Optional
        messages_override: Optional[List[Dict]] = None, # Use Optional
    ) -> Any: # Return type depends on client (string or OpenAI response object)
        """
        Processes text using the configured LLM client.

        Args:
            text: The user's message content (context + command)
            system_prompt_override: Optional override for the system prompt
            max_tokens: Maximum number of tokens to generate
            temperature: Sampling temperature (0.0 to 1.0)
            tools: List of tools available to the model
            messages_override: Optional override for the message history

        Returns:
            The processed response from the LLM, or None if processing failed.
            This can be a string or an OpenAI response object if tools are used.
        """
        start_time = time.time()

        if not text and not messages_override: # If messages_override is present, text might be implicitly handled
            print("LLMHandler: Received empty text for user message and no messages_override.")
            return None


        # Determine the system prompt to use
        # If messages_override is provided, it might already contain a system message.
        # The client's generate_response method should handle how system_prompt and messages_override interact.
        system_prompt = (
            system_prompt_override
            if system_prompt_override
            else DEFAULT_LLM_SYSTEM_PROMPT
        )
        if not system_prompt: # Ensure system_prompt is not empty if it's going to be used
            print("LLMHandler Warning: LLM system prompt is empty. Using a default space.")
            system_prompt = " "

        try:
            response = self.client.generate_response(
                text=text,
                system_prompt=system_prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                tools=tools or [], # Pass empty list if None
                messages_override=messages_override or [], # Pass empty list if None
            )

            if response is not None:
                pass # Response is already in desired format from client
            else:
                print(f"LLMHandler: Received no response or an error from {self.client.source_name}.")

            end_time = time.time()
            print(
                f"{self.client.source_name} LLM API response time for model {self.client.user_command_model_name}: {end_time - start_time:.2f} seconds"
            )
            return response

        except Exception as e:
            print(f"LLMHandler: An unexpected error occurred while calling client's generate_response: {e}")
            import traceback
            traceback.print_exc()
            return None

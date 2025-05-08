from abc import ABC, abstractmethod
import io
from typing import Any, List, Dict, Optional

class LLMClientInterface(ABC):
    """
    Interface for LLM client implementations.
    """

    @property
    @abstractmethod
    def source_name(self) -> str:
        """
        Returns an identifier for the LLM source (e.g., 'openai_api', 'ollama').
        """
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """
        Returns the name of the specific LLM model being used by this client.
        """
        pass

    @abstractmethod
    def generate_response(
        self,
        text: str,
        system_prompt: str,
        max_tokens: int,
        temperature: float,
        tools: Optional[List[Dict]] = None, # Changed to Optional[List[Dict]] and default to None
        messages_override: Optional[List[Dict]] = None, # Changed to Optional[List[Dict]] and default to None
    ) -> Any: # Return type can be a string or a provider-specific object (e.g., OpenAI's response for tools)
        """
        Processes the input text and generates a response from the LLM.

        Args:
            text: The user's message content.
            system_prompt: The system prompt to guide the LLM.
            max_tokens: Maximum number of tokens to generate.
            temperature: Sampling temperature for generation.
            tools: Optional list of tools for the LLM to use (OpenAI specific).
            messages_override: Optional list of messages to override the default conversation structure.

        Returns:
            The LLM's response. This could be a string or a more complex object
            if tools are involved (e.g., OpenAI's ChatCompletion object).
        """
        pass

    @abstractmethod
    def check_availability(self) -> bool:
        """
        Checks if the LLM provider is available and configured correctly.

        Returns:
            True if the client is ready to be used, False otherwise.
        """
        pass
    
    @abstractmethod
    def transcribe_audio(self, audio_buffer: io.BytesIO) -> str:
        """
        Transcribes audio from a buffer and returns the text.
        """
        pass
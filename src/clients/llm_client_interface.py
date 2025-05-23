import io
from abc import ABC, abstractmethod
from typing import Any

from src.clients.types import ToolCallDict


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
    def user_command_model_name(self) -> str:
        """
        Returns the name of the specific LLM model being used by this client.
        """
        pass

    @property
    @abstractmethod
    def asr_model_name(self) -> str:
        """
        Returns the name of the specific ASR model being used by this client.
        """
        pass

    @abstractmethod
    def generate_response(
        self,
        text: str,
        system_prompt: str,
        max_tokens: int,
        temperature: float,
        tool_functions: list[dict]
        | None = None,  # Changed to Optional[List[Dict]] and default to None
        messages_override: list[dict]
        | None = None,  # Changed to Optional[List[Dict]] and default to None
    ) -> Any:  # Return type can be a string or a provider-specific object (e.g., OpenAI's response for tools)
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
    def generate_response_with_audio(
        self,
        audio_buffer: bytes,
        text: str,
        system_prompt: str,
        max_tokens: int,
        temperature: float,
        tools: list[dict]
        | None = None,  # Changed to Optional[List[Dict]] and default to None
        messages_override: list[dict]
        | None = None,  # Changed to Optional[List[Dict]] and default to None
    ) -> Any:
        """
        Processes audio and text using the configured LLM client.
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

    @abstractmethod
    def format_system_user_messages(
        self, system_prompt: str, user_prompt: str
    ) -> list[Any]:
        """
        Formats the system prompt and user text into a list of messages.

        Args:
            system_prompt: The system prompt to include.
            text: The user's message content.

        Returns:
            A list of dictionaries representing the formatted messages.
        """
        pass

    @abstractmethod
    def format_tool_result_messages(
        self,
        tool_id: str,
        name: str,
        args: dict,
        result: str,
    ) -> list[Any]:
        pass

    @abstractmethod
    def format_user_message(self, content: str) -> Any:
        pass

    @abstractmethod
    def extract_tool_calls(self, response: Any) -> list[ToolCallDict] | None:
        """
        Extracts tool calls from the LLM response.

        Args:
            response: The response object from the LLM.

        Returns:
            A list of tool calls if present, otherwise None.
        """
        pass

    @staticmethod
    def tool_functions_to_openai_format(
        tool_functions: list[dict] | None,
    ) -> list[dict]:
        """

        Converts tool functions to OpenAI's expected format.

        Also supported by Groq

        Args:
            tool_functions: List of tool functions to convert.

        Returns:
            List of dictionaries in OpenAI's function format.
        """
        if not tool_functions:
            return []

        result = []
        for tool in tool_functions:
            result.append({"type": "function", "function": tool})
        return result

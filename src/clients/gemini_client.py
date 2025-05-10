import io
from typing import Any, List, Dict, Optional
from google import genai
from google.genai import types

from src.clients.llm_client_interface import LLMClientInterface
from src.utils.timing import time_method


class GeminiClient(LLMClientInterface):
    def __init__(self, api_key: str, user_command_model: str, asr_model: str):
        if not api_key:
            raise ValueError("Gemini API key is required.")

        self._api_key = api_key
        self._user_command_model = user_command_model
        self._asr_model = asr_model
        self._client = genai.Client(api_key=self._api_key)
        self._is_valid = (
            True  # Assume valid if key is provided, check_availability can do more
        )

    @property
    def source_name(self) -> str:
        return "gemini_api"

    @property
    def user_command_model_name(self) -> str:
        return self._user_command_model

    @property
    def asr_model_name(self) -> str:
        return self._asr_model

    def check_availability(self) -> bool:
        if not self._api_key:
            print("GeminiClient ERROR: API key is missing.")
            self._is_valid = False
            return False
        print("GeminiClient: API key is present.")
        self._is_valid = True
        return True

    @time_method
    def generate_response(
        self,
        text: str,
        system_prompt: str,
        max_tokens: int,
        temperature: float,
        tools: list[dict] = [],
        messages_override: Optional[List[Dict]] = None,
    ) -> Any:
        if (
            not self._is_valid
        ):  # Relies on check_availability being called or key presence
            print(
                "GeminClient ERROR: API key is invalid or missing. Cannot process request."
            )
            return None

        if not self._user_command_model:
            raise ValueError("Gemini user command model is required.")

        if tools or messages_override:
            print(
                "Inten hasn't implemented tool support or messages_override for GeminiClient."
            )
            return None

        try:
            response = self._client.models.generate_content(
                model=self._user_command_model,
                contents=system_prompt + text,
                generation_config=types.GenerationConfig(
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                ),
            )

            return response.text
        except Exception as e:
            # Catch broader exceptions during the API call
            print(f"An unexpected error occurred during Gemini transcription: {e}")
            return ""  # Return empty string on unexpected errors

    @time_method
    def transcribe_audio(self, audio_buffer: io.BytesIO) -> str:
        """Transcribes audio using the Gemini API."""
        if not self._client:
            print("Error: Gemini client not initialized.")
            return ""

        if not self._asr_model:
            raise ValueError("Gemini ASR model is required.")

        try:
            audio_buffer.name = "audio.wav"

            transcript_response = self._client.models.generate_content(
                model=self._asr_model,
                content=[
                    "Transcribe this audio",
                    types.Part.from_bytes(data=audio_buffer, mime_tytpe="audio/wav"),
                ],
            )

            # Ensure the response is treated as a string
            transcript = (
                transcript_response.text if isinstance(transcript_response, str) else ""
            )
            return transcript.strip()

        except Exception as e:
            # Catch broader exceptions during the API call
            print(f"An unexpected error occurred during Gemini transcription: {e}")
            return ""  # Return empty string on unexpected errors

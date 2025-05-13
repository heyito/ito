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
            )

            return response.text
        except Exception as e:
            # Catch broader exceptions during the API call
            print(f"An unexpected error occurred during Gemini transcription: {e}")
            return ""  # Return empty string on unexpected errors
        
    @time_method
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
        print(f"GeminiClient: Audio buffer type: {type(audio_buffer)}")
        print(f"GeminiClient: Audio buffer content: {audio_buffer}")
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
            processed_audio_data: bytes
            if isinstance(audio_buffer, io.BytesIO):
                # If it's BytesIO, get its value as bytes
                processed_audio_data = audio_buffer.getvalue()
            elif isinstance(audio_buffer, bytes):
                # If it's already bytes, use it directly
                processed_audio_data = audio_buffer
            else:
                # Log error for unexpected type and return
                print(f"GeminiClient ERROR: audio_buffer has unexpected type {type(audio_buffer)}. Expected bytes or io.BytesIO.")
                return None

            response = self._client.models.generate_content(
                model=self._user_command_model,
                contents=[system_prompt, text, types.Part.from_bytes(data=processed_audio_data, mime_type="audio/wav")],
            )

            print(f"GeminiClient: Response: {response}")
            print(f"GeminiClient: Response text: {response.text}")

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
            audio_data_bytes = audio_buffer.getvalue()

            transcript_response = self._client.models.generate_content(
                model=self._asr_model,
                contents=[
                    "Generate a transcript of the audio.",
                    types.Part.from_bytes(data=audio_data_bytes, mime_type="audio/wav"),
                ],
            )

            return transcript_response.text

        except Exception as e:
            # Catch broader exceptions during the API call
            print(f"An unexpected error occurred during Gemini transcription: {e}")
            return ""  # Return empty string on unexpected errors

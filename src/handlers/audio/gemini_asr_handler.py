from src.clients.gemini_client import GeminiClient
from src.handlers.audio.asr_handler_interface import ASRHandlerInterface
from src.utils.timing import time_method
from functools import partial

class GeminiASRHandler(ASRHandlerInterface):
    def __init__(self, gemini_client: GeminiClient): # Corrected parameter name
        self._client = gemini_client

    @time_method
    def transcribe_audio(self, audio_data: bytes) -> str:
        """Transcribes audio data asynchronously using Gemini."""
        transcribe_prompt = 'Generate a transcript of the audio.'
        response = self._client.models.generate_content(
            model=self._client.model,
            contents=[transcribe_prompt, audio_data]
        )

        return response.text
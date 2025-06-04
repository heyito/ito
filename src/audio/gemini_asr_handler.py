from src.audio.asr_handler_interface import ASRHandlerInterface
from src.clients.gemini_client import GeminiClient
from src.utils.timing import time_method


class GeminiASRHandler(ASRHandlerInterface):
    def __init__(self, gemini_client: GeminiClient):  # Corrected parameter name
        self._client = gemini_client

    @time_method
    def transcribe_audio(self, audio_data: bytes) -> str:
        """Transcribes audio data asynchronously using Gemini."""

        return self._client.transcribe_audio(audio_data)

import io

from src.clients.groq_client import GroqClient
from src.handlers.audio.asr_handler_interface import ASRHandlerInterface
from src.utils.timing import time_method

class GroqASRHandler(ASRHandlerInterface):
    """ASR Handler implementation using the Groq API."""
    def __init__(self, groqClient: GroqClient):
        self._client = groqClient

    @time_method
    def transcribe_audio(self, audio_buffer: io.BytesIO) -> str:
        return self._client.transcribe_audio(audio_buffer)
    
import io

from src.audio.asr_handler_interface import ASRHandlerInterface
from src.clients.openai_client import OpenAIClient
from src.utils.timing import time_method


class OpenAIASRHandler(ASRHandlerInterface):
    """ASR Handler implementation using the OpenAI API."""

    def __init__(self, openAIClient: OpenAIClient):
        self._client = openAIClient

    @time_method
    def transcribe_audio(self, audio_buffer: io.BytesIO) -> str:
        # pass through to the OpenAIClient
        return self._client.transcribe_audio(audio_buffer)

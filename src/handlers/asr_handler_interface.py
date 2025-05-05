import io
from abc import ABC, abstractmethod


class ASRHandlerInterface(ABC):
    @abstractmethod
    def transcribe_audio(self, audio_buffer: io.BytesIO) -> str:
        """Transcribe audio from a buffer and return the text."""
        pass

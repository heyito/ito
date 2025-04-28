# src/handlers/openai_asr_handler.py
import io
import time
from openai import OpenAI, OpenAIError

from .asr_handler_interface import ASRHandlerInterface


class OpenAIASRHandler(ASRHandlerInterface):
    """ASR Handler implementation using the OpenAI API."""
    def __init__(self, api_key: str, model: str):
        if not api_key:
            # Consider raising a more specific configuration error
            raise ValueError("OpenAI API key is required for OpenAIASRHandler.")
        self.api_key = api_key
        self.model = model
        try:
            self.client = OpenAI(api_key=self.api_key)
        except Exception as e:
            print(f"Failed to initialize OpenAI client: {e}")
            # Decide error handling: re-raise, log, or set client to None and handle in transcribe
            raise
        print(f"OpenAIASRHandler Initialized: Model={self.model}")

    def transcribe_audio(self, audio_buffer: io.BytesIO) -> str:
        """Transcribes audio using the OpenAI Whisper API."""
        if not self.client:
             print("Error: OpenAI client not initialized.")
             return ""
        try:
            # The Whisper API needs a filename hint, especially for format detection.
            audio_buffer.name = "audio.wav"

            print(f"Sending audio to OpenAI Whisper API (model: {self.model})...")
            start_time = time.time()

            transcript_response = self.client.audio.transcriptions.create(
                model=self.model,
                file=audio_buffer,
                response_format="text" # Explicitly request text
            )
            end_time = time.time()
            print(f"OpenAI transcription received in {end_time - start_time:.2f} seconds.")

            # Ensure the response is treated as a string
            transcript = transcript_response if isinstance(transcript_response, str) else ""
            return transcript.strip()

        except OpenAIError as e:
            print(f"OpenAI API Error during transcription: {e}")
            return "" # Return empty string on specific API errors
        except Exception as e:
            # Catch broader exceptions during the API call
            print(f"An unexpected error occurred during OpenAI transcription: {e}")
            return "" # Return empty string on unexpected errors 
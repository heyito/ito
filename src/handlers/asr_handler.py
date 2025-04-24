import io
from openai import OpenAI, OpenAIError
import numpy as np
import time # For timing if needed
from typing import Optional # Import Optional


class ASRHandler:
    def __init__(self, source: str, api_key: str, model: str,
                 local_model_size: str, # Receives str
                 device: str,           # Receives str
                 compute_type: str):   # Receives str

        # Assign required values
        self.source = source
        print(f"ASRHandler Initialized: Source={self.source}")
        self.model = model # Model name (e.g., whisper-1 or local path)
        self.api_key = api_key # Needed if provider is openai_api

        # Retrieve optional values from providers using .get() with defaults
        self.local_model_size = local_model_size
        print(f"ASRHandler Initialized: Local Model Size={self.local_model_size}")
        self.device = device
        print(f"ASRHandler Initialized: Device={self.device}")
        self.compute_type = compute_type
        print(f"ASRHandler Initialized: Compute Type={self.compute_type}")

        self.faster_whisper_model_cache = {} # Instance cache

        # Optional: Add validation or print statements here
        print(f"ASRHandler Initialized: Source={self.source}, Model={self.model}")
        if self.source == 'openai_api' and not self.api_key:
             print("Warning: OpenAI ASR provider selected but no API key provided.")
        elif self.source == 'faster_whisper':
             print(f"  Faster Whisper Config: Size={self.local_model_size}, Device={self.device}, Compute={self.compute_type}")

    def transcribe_audio(self, audio_buffer: io.BytesIO):
        """
        Transcribes audio using the configured provider and settings.
        Returns the transcribed text or None if failed.
        """
        if self.source == "openai_api":
            if not self.api_key:
                print("Error: OpenAI API key is required for openai_api provider.")
                return None
            try:
                client = OpenAI(api_key=self.api_key)
                audio_buffer.name = "audio.wav" # Whisper API needs a filename hint

                print(f"Sending audio to OpenAI Whisper API (model: {self.model})...")
                start_time = time.time()
                # Use self.model for the model name
                transcript = client.audio.transcriptions.create(
                    model=self.model,
                    file=audio_buffer,
                    response_format="text"
                )
                end_time = time.time()
                print(f"OpenAI transcription received in {end_time - start_time:.2f} seconds.")
                return transcript.strip() if isinstance(transcript, str) else None

            except OpenAIError as e:
                print(f"OpenAI API Error during transcription: {e}")
                return None
            except Exception as e:
                print(f"An unexpected error occurred during OpenAI transcription: {e}")
                return None

        elif self.source == "faster_whisper":
            try:
                from faster_whisper import WhisperModel # Import locally
            except ImportError:
                print("Error: faster-whisper library not found. Please install it: pip install faster-whisper")
                return None

            # Use instance attributes for faster-whisper config
            print(f"Using faster-whisper locally...")
            print(f"  Model size: {self.local_model_size}")
            print(f"  Device: {self.device}")
            print(f"  Compute Type: {self.compute_type}")

            try:
                # Cache the model loading
                model_key = (self.local_model_size, self.device, self.compute_type)
                # Use instance cache or module cache (_faster_whisper_model_cache)
                if model_key not in self.faster_whisper_model_cache:
                    print(f"Loading faster-whisper model '{self.local_model_size}'...")
                    self.faster_whisper_model_cache[model_key] = WhisperModel(
                        model_size_or_path=self.local_model_size,
                        device=self.device,
                        compute_type=self.compute_type
                    )
                    print("Model loaded.")
                model_instance = self.faster_whisper_model_cache[model_key]

                print("Starting local transcription...")
                start_time = time.time()
                segments, info = model_instance.transcribe(
                    audio=audio_buffer, # Can directly pass BytesIO containing WAV
                    beam_size=5,
                    language="en" if ".en" in self.local_model_size else None # Set language if using multilingual model
                )

                transcribed_text = ""
                for segment in segments:
                    transcribed_text += segment.text + " "

                end_time = time.time()
                print(f"Local transcription completed in {end_time - start_time:.2f} seconds.")
                print(f"Detected language: {info.language} (Probability: {info.language_probability:.2f})")
                return transcribed_text.strip()

            except Exception as e:
                print(f"An error occurred during faster-whisper transcription: {e}")
                import traceback
                traceback.print_exc() # Print full traceback for debugging
                return None

        else:
            print(f"Error: Unknown ASR source '{self.source}'")
            return None

# Need to update the main call in main.py to pass the specific args
# In main.py, within processing_thread_func:
# Change the transcribe_audio call to:
#
# transcribed_text = asr_handler.transcribe_audio(
#     audio_buffer=audio_buffer,
#     source=asr_source,
#     api_key=openai_api_key,  # Still pass API key in case source is OpenAI
#     model=asr_model,        # Pass OpenAI model name
#     # Pass specific args for local source
#     local_model_size=config['ASR'].get('local_model_size', 'base.en'),
#     device=config['ASR'].get('device', 'auto'),
#     compute_type=config['ASR'].get('compute_type', 'default')
# )
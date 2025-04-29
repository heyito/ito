# src/handlers/faster_whisper_asr_handler.py
import io
import time
import traceback
from typing import Optional

from src.handlers.asr_handler_interface import ASRHandlerInterface

# Attempt to import faster_whisper only once at the module level
try:
    from faster_whisper import WhisperModel
    FASTER_WHISPER_AVAILABLE = True
except ImportError:
    WhisperModel = None # Define WhisperModel as None if import fails
    FASTER_WHISPER_AVAILABLE = False
    print("Warning: faster-whisper library not found. FasterWhisperASRHandler will not be usable.")
    print("Install it with: pip install faster-whisper")


class FasterWhisperASRHandler(ASRHandlerInterface):
    """ASR Handler implementation using the faster-whisper library."""

    # Class-level cache for loaded models to avoid redundant loading
    _model_cache = {}

    def __init__(self, local_model_size: str, device: str, compute_type: str):
        if not FASTER_WHISPER_AVAILABLE:
            raise ImportError("faster-whisper library is required for FasterWhisperASRHandler but not installed.")

        self.local_model_size = local_model_size
        self.device = device
        self.compute_type = compute_type
        self.model_instance = self._load_model()
        print(f"FasterWhisperASRHandler Initialized: Size={self.local_model_size}, Device={self.device}, Compute={self.compute_type}")

    def _load_model(self) -> Optional[WhisperModel]:
        """Loads the faster-whisper model, utilizing a class-level cache."""
        if not WhisperModel: # Check if import failed
            return None

        model_key = (self.local_model_size, self.device, self.compute_type)
        if model_key not in FasterWhisperASRHandler._model_cache:
            print(f"Loading faster-whisper model '{self.local_model_size}' (Device: {self.device}, Compute: {self.compute_type})...")
            try:
                loaded_model = WhisperModel(
                    model_size_or_path=self.local_model_size,
                    device=self.device,
                    compute_type=self.compute_type
                )
                FasterWhisperASRHandler._model_cache[model_key] = loaded_model
                print("Model loaded successfully.")
            except Exception as e:
                print(f"Error loading faster-whisper model '{self.local_model_size}': {e}")
                traceback.print_exc()
                # Store None in cache for this key to avoid retrying load on every call
                FasterWhisperASRHandler._model_cache[model_key] = None
                # Optionally re-raise or handle more gracefully depending on desired behavior
                # raise # Re-raising might be appropriate if the app cannot function without the model

        return FasterWhisperASRHandler._model_cache.get(model_key)

    def transcribe_audio(self, audio_buffer: io.BytesIO) -> str:
        """Transcribes audio using the loaded faster-whisper model."""
        if not self.model_instance:
            print("Error: Faster Whisper model is not loaded or failed to load.")
            return ""

        print(f"Using faster-whisper locally (Model: {self.local_model_size})...")
        try:
            start_time = time.time()

            # Determine language hint based on model name convention
            language_code = "en" if self.local_model_size and ".en" in self.local_model_size else None
            if language_code:
                print(f"  Using language hint: {language_code}")

            segments, info = self.model_instance.transcribe(
                audio=audio_buffer, # faster-whisper can handle BytesIO directly
                beam_size=5,        # Example parameter, adjust as needed
                language=language_code
            )

            transcribed_text = "".join(segment.text for segment in segments)

            end_time = time.time()
            processing_time = end_time - start_time
            print(f"Local transcription completed in {processing_time:.2f} seconds.")
            if info:
                 print(f"  Detected language: {info.language} (Probability: {info.language_probability:.2f})", flush=True)
            else:
                 print("  Transcription info not available.", flush=True)

            return transcribed_text.strip()

        except Exception as e:
            print(f"An error occurred during faster-whisper transcription: {e}")
            traceback.print_exc()
            return "" # Return empty string on error 
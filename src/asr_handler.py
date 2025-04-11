import io
from openai import OpenAI, OpenAIError
import numpy as np
import time # For timing if needed

# Import faster-whisper only if needed to avoid dependency if not used
_faster_whisper_model_cache = {} # Simple cache for loaded models

def transcribe_audio(audio_buffer: io.BytesIO, provider: str, api_key: str = None, model: str = "whisper-1", **kwargs):
    """
    Transcribes audio using the specified provider.
    kwargs can include local_model_size, device, compute_type for local providers.
    Returns the transcribed text or None if failed.
    """
    global _faster_whisper_model_cache

    if provider == "openai_api":
        # ... (Keep existing OpenAI API logic) ...
        if not api_key:
            print("Error: OpenAI API key is required for openai_api provider.")
            return None
        try:
            client = OpenAI(api_key=api_key)
            audio_buffer.name = "audio.wav" # Whisper API needs a filename hint

            print(f"Sending audio to OpenAI Whisper API (model: {model})...")
            start_time = time.time()
            transcript = client.audio.transcriptions.create(
                model=model,
                file=audio_buffer,
                response_format="text"
            )
            end_time = time.time()
            print(f"OpenAI transcription received in {end_time - start_time:.2f} seconds.")
            # The response is directly the text string when response_format="text"
            return transcript.strip() if isinstance(transcript, str) else None

        except OpenAIError as e:
            print(f"OpenAI API Error during transcription: {e}")
            return None
        except Exception as e:
            print(f"An unexpected error occurred during OpenAI transcription: {e}")
            return None

    elif provider == "faster_whisper":
        try:
            from faster_whisper import WhisperModel # Import locally
        except ImportError:
            print("Error: faster-whisper library not found. Please install it: pip install faster-whisper")
            return None

        local_model_size = kwargs.get('local_model_size', 'base.en')
        device = kwargs.get('device', 'auto')
        compute_type = kwargs.get('compute_type', 'default') # Let faster-whisper decide

        print(f"Using faster-whisper locally...")
        print(f"  Model size: {local_model_size}")
        print(f"  Device: {device}")
        print(f"  Compute Type: {compute_type}")

        try:
            # Cache the model loading
            model_key = (local_model_size, device, compute_type)
            if model_key not in _faster_whisper_model_cache:
                 print(f"Loading faster-whisper model '{local_model_size}'...")
                 # This will download the model on first use if not already cached locally by faster-whisper
                 _faster_whisper_model_cache[model_key] = WhisperModel(
                     model_size_or_path=local_model_size,
                     device=device,
                     compute_type=compute_type
                 )
                 print("Model loaded.")
            model = _faster_whisper_model_cache[model_key]

            # Transcribe the audio buffer
            # faster-whisper's transcribe method can take a file path or an audio numpy array
            # The audio buffer should contain a valid WAV file with:
            # - 16-bit PCM audio data
            # - Sample rate matching the model's expectations (typically 16kHz)
            # - Proper WAV header with format information
            print("Starting local transcription...")
            start_time = time.time()
            # The transcribe method returns an iterator of Segment objects and info
            segments, info = model.transcribe(
                audio=audio_buffer, # Can directly pass BytesIO containing WAV
                beam_size=5,
                language="en" if ".en" in local_model_size else None # Set language if using multilingual model
                # vad_filter=True, # Enable VAD filter if desired
                # vad_parameters=dict(min_silence_duration_ms=500),
            )

            # Process segments
            transcribed_text = ""
            for segment in segments:
                # print(f"Segment: [{segment.start:.2f}s -> {segment.end:.2f}s] {segment.text}")
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
        print(f"Error: Unknown ASR provider '{provider}'")
        return None

# Need to update the main call in main.py to pass the specific args
# In main.py, within processing_thread_func:
# Change the transcribe_audio call to:
#
# transcribed_text = asr_handler.transcribe_audio(
#     audio_buffer=audio_buffer,
#     provider=asr_provider,
#     api_key=openai_api_key,  # Still pass API key in case provider is OpenAI
#     model=asr_model,        # Pass OpenAI model name
#     # Pass specific args for local provider
#     local_model_size=config['ASR'].get('local_model_size', 'base.en'),
#     device=config['ASR'].get('device', 'auto'),
#     compute_type=config['ASR'].get('compute_type', 'default')
# )
import io
import numpy as np
import scipy.io.wavfile as wavfile
import logging


def save_wav_to_buffer(audio_data_numpy, sample_rate):
    """Save audio data to a WAV file in memory buffer.

    Args:
        audio_data_numpy: NumPy array containing audio samples
        sample_rate: Sample rate in Hz

    Returns:
        BytesIO buffer containing WAV file data, or None if failed
    """
    if not isinstance(audio_data_numpy, np.ndarray) or audio_data_numpy.size == 0:
        logging.error("Invalid or empty audio data provided for saving.")
        return None
    try:
        buffer = io.BytesIO()
        # Ensure data is int16 for standard WAV format
        # Convert float data to int16 with proper scaling
        if audio_data_numpy.dtype != np.int16:
            if np.issubdtype(audio_data_numpy.dtype, np.floating):
                audio_data_numpy = (audio_data_numpy * 32767).astype(np.int16)
            else:
                audio_data_numpy = audio_data_numpy.astype(np.int16)

        wavfile.write(buffer, sample_rate, audio_data_numpy)
        buffer.seek(0)  # Rewind buffer to the beginning for reading
        return buffer
    except Exception as e:
        logging.error(f"Error saving audio to WAV buffer: {e}")
        return None

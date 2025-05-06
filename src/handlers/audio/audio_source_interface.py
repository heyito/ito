from abc import ABC, abstractmethod
import io
import threading
from typing import Callable, Any, Literal, Union
import scipy.io.wavfile as wavfile
import numpy as np
import asyncio

AudioChunk = Union[np.ndarray, bytes]
# Define a callback type hint for clarity
AudioCallback = Callable[[AudioChunk], None] # Simple callback
AsyncAudioCallback = Callable[[AudioChunk], asyncio.Future] # Async callback

class AudioSourceInterface(ABC):
    def __init__(self, sample_rate: int, channels: int, device_index: int):
        self.sample_rate = sample_rate
        self.channels = channels
        # Retrieve optional device_index from source
        raw_device_index_str = device_index
        self.device_index = None # Default to None
        if raw_device_index_str:
            try:
                self.device_index = int(raw_device_index_str)
            except (ValueError, TypeError):
                print(f"Warning: Invalid device_index '{raw_device_index_str}' in config. Using default (None).")

        # Add validation for required values if needed
        if not isinstance(self.sample_rate, int) or self.sample_rate <= 0:
             print(f"ERROR: Invalid sample_rate: {self.sample_rate}. Cannot continue.")
             raise ValueError("Invalid sample_rate")
        if not isinstance(self.channels, int) or self.channels <= 0:
             print(f"ERROR: Invalid channels: {self.channels}. Cannot continue.")
             raise ValueError("Invalid channels")

        # Print initialized values
        print(f"AudioHandler Initialized: Rate={self.sample_rate}, Channels={self.channels}, Device={self.device_index}")

    @abstractmethod
    def record_audio_stream_with_vad(self, stop_event, audio_queue, vad_config):
        """
        Continuously records audio, putting chunks into a queue.
        Uses VAD to set stop_event after a period of silence.
        Accepts VAD configuration dictionary.
        """
        pass

    @abstractmethod
    def stream_audio_to_async_queue(self,
                                  stop_event: threading.Event,
                                  async_queue: asyncio.Queue,
                                  loop: asyncio.AbstractEventLoop,
                                  output_format: Literal['numpy', 'bytes'] = 'bytes'): # Default to bytes for Vosk
        """Starts streaming audio chunks into the provided asyncio Queue."""
        pass
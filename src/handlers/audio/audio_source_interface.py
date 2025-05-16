from abc import ABC, abstractmethod
import io
import threading
import time
from typing import Callable, Any, Literal, Union
import scipy.io.wavfile as wavfile
import numpy as np
import sounddevice as sd
import asyncio

AudioChunk = Union[np.ndarray, bytes]
# Define a callback type hint for clarity
AudioCallback = Callable[[AudioChunk], None]  # Simple callback
AsyncAudioCallback = Callable[[AudioChunk], asyncio.Future]  # Async callback


class AudioSourceInterface(ABC):
    def __init__(self, sample_rate: int, channels: int, device_index: int):
        self.sample_rate = sample_rate
        self.channels = channels
        # Retrieve optional device_index from source
        raw_device_index_str = device_index
        self.device_index = None  # Default to None
        if raw_device_index_str:
            try:
                self.device_index = int(raw_device_index_str)
            except (ValueError, TypeError):
                print(
                    f"Warning: Invalid device_index '{raw_device_index_str}' in config. Using default (None)."
                )

        # Add validation for required values if needed
        if not isinstance(self.sample_rate, int) or self.sample_rate <= 0:
            print(f"ERROR: Invalid sample_rate: {self.sample_rate}. Cannot continue.")
            raise ValueError("Invalid sample_rate")
        if not isinstance(self.channels, int) or self.channels <= 0:
            print(f"ERROR: Invalid channels: {self.channels}. Cannot continue.")
            raise ValueError("Invalid channels")

        # Warm up the audio device
        self.warm_up_audio_device()

        # Print initialized values
        print(
            f"AudioHandler Initialized: Rate={self.sample_rate}, Channels={self.channels}, Device={self.device_index}"
        )

    def warm_up_audio_device(self):
        # At application startup
        try:
            if self.device_index is None:
                sd.query_devices()
                default_input_idx = sd.default.device[0]
                print(
                    f"No device index provided. Using default input device index: {default_input_idx}"
                )
                self.device_index = default_input_idx

            print("Pre-warming audio device...")
            # Time the operation
            start_time = time.monotonic()
            with sd.InputStream(
                samplerate=self.sample_rate,  # or a common rate like 44100
                channels=1,  # minimal
                device=self.device_index,  # or None if not yet known
                blocksize=1,  # minimal
                latency="high",
            ):  # use 'high' for faster pre-warm init
                sd.sleep(10)  # Keep it open for a tiny moment (10ms)
            warmup_time = time.monotonic() - start_time
            print(f"Audio device pre-warmed in {warmup_time * 1000:.1f}ms")

        except Exception as e:
            print(f"Could not pre-warm audio device: {e}")

    @abstractmethod
    def record_audio_stream_with_vad(self, stop_event, audio_queue, vad_config):
        """
        Continuously records audio, putting chunks into a queue.
        Uses VAD to set stop_event after a period of silence.
        Accepts VAD configuration dictionary.
        """
        pass

    @abstractmethod
    def stream_audio_to_async_queue(
        self,
        stop_event: threading.Event,
        async_queue: asyncio.Queue,
        loop: asyncio.AbstractEventLoop,
        vad_config,
        output_format: Literal["numpy", "bytes"] = "bytes",
    ):  # Default to bytes for Vosk
        """Starts streaming audio chunks into the provided asyncio Queue."""
        pass

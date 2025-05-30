import logging
import time

import numpy as np
import sounddevice as sd

from src.handlers.audio.audio_source_interface import AudioSourceInterface
from src.ui.keyboard_manager import KeyboardManager

logger = logging.getLogger("AudioSourceHandler")

class AudioSourceHandler(AudioSourceInterface):
    def __init__(self, sample_rate: int, channels: int):
        super().__init__(sample_rate, channels)
        self._keyboard_manager = KeyboardManager.instance()

    def record_audio_stream(self, stop_event, audio_queue):
        def callback(indata, frames, time_info, status):
            """Sounddevice callback. Puts data in queue."""
            if status:
                logger.warning(f"Sounddevice status: {status}")

            # Always queue the raw audio data first
            audio_queue.put(indata.copy())

        dtype = np.int16
        # --- Stream Execution ---
        try:
            logger.info(
                f"Attempting to open stream: device={self.device_index}, rate={self.sample_rate}, channels={self.channels}, blocksize={128}"
            )
            stream_start_time = time.monotonic()
            with sd.InputStream(
                samplerate=self.sample_rate,
                channels=self.channels,
                dtype=dtype,
                blocksize=128,
                device=self.device_index,
                latency=0.020,
                callback=callback,
            ):
                stream_init_time = time.monotonic() - stream_start_time
                logger.info(
                    f"Audio stream opened in {stream_init_time * 1000:.1f}ms. Recording... (Waiting for speech and subsequent silence)"
                )
                # Keep the stream alive until stop_event is set
                while not stop_event.is_set():
                    time.sleep(0.1)
                logger.info("Stop event received by recording stream loop.")

        except sd.PortAudioError as e:
            logger.error(f"PortAudio Error: {e}")
            stop_event.set()
            raise
        except Exception as e:
            logger.error(f"An unexpected error occurred in the audio stream: {e}")
            stop_event.set()
            raise
        finally:
            logger.info("Audio stream closed.")

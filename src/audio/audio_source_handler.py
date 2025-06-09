# audio_source_handler.py (Corrected)

import logging
import queue
import threading

import numpy as np

from src.audio.audio_device_manager import AudioDeviceManager
from src.audio.audio_source_interface import AudioSourceInterface

logger = logging.getLogger(__name__)


class AudioSourceHandler(AudioSourceInterface):
    def __init__(self, sample_rate: int, channels: int):
        super().__init__(sample_rate, channels)
        # Get the singleton instance internally
        self._device_manager = AudioDeviceManager.get_instance()

    def record_audio_stream(
        self,
        stop_event: threading.Event,
        audio_queue: queue.Queue,
        start_time: float = None,
        **kwargs,
    ):
        logger.info("Audio recording requested.")
        mic = self._device_manager.get_current_microphone()

        if not mic:
            logger.error(
                "Recording cannot start: No default audio input device is available."
            )
            return

        logger.info(f"Starting recording session on device: '{mic.name}'")

        try:
            # Use this device for the entire recording session.
            # By OMITTING the `blocksize` argument, we let soundcard choose the
            # optimal, device-specific default value.
            with mic.recorder(
                samplerate=self.sample_rate,
                channels=self.channels,
            ) as recorder:
                while not stop_event.is_set():
                    try:
                        # recorder.record(numframes=None) records one block of the default size.
                        # This is exactly what we want for a responsive, chunk-based loop.
                        data = recorder.record(numframes=None)
                        if data.size > 0:
                            self.audio_detected_callback()
                            data_int16 = (data * 32767).astype(np.int16)
                            audio_queue.put_nowait(data_int16)
                    except queue.Full:
                        logger.warning("Audio queue is full. Dropping audio frame.")
                    except Exception as e:
                        logger.error(
                            f"Error during recording on '{mic.name}': {e}. Stopping session."
                        )
                        break
        except Exception as e:
            logger.error(f"Failed to start recorder on device '{mic.name}': {e}")
            return
        finally:
            logger.info("Audio recording loop has been stopped.")

    def cleanup(self):
        pass

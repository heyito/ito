import logging
from abc import ABC, abstractmethod

import numpy as np

# Configure logging
logger = logging.getLogger(__name__)

AudioChunk = np.ndarray | bytes


class AudioSourceInterface(ABC):
    def __init__(self, sample_rate: int, channels: int):
        self.sample_rate = sample_rate
        self.channels = channels

        # Add validation for required values if needed
        if not isinstance(self.sample_rate, int) or self.sample_rate <= 0:
            logger.error(f"Invalid sample_rate: {self.sample_rate}. Cannot continue.")
            raise ValueError("Invalid sample_rate")
        if not isinstance(self.channels, int) or self.channels <= 0:
            logger.error(f"Invalid channels: {self.channels}. Cannot continue.")
            raise ValueError("Invalid channels")

        # Print initialized values
        logger.info(
            f"AudioHandler Initialized: Rate={self.sample_rate}, Channels={self.channels}"
        )

    @abstractmethod
    def record_audio_stream(self, stop_event, audio_queue):
        """
        Contuinously records audio, putting cunks into a queue.

        Takes signal from stop_event to terminate
        """
        pass

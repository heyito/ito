# src/realtime_asr_interface.py
import asyncio
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any

class RealTimeASRProcessor(ABC):
    """Interface for real-time ASR processors (like Vosk, WebRTC)."""

    @abstractmethod
    def __init__(self, audio_input_queue: asyncio.Queue, sample_rate: int, transcript_output_queue: asyncio.Queue, **kwargs):
        """Initializes with necessary queues and configuration."""
        pass

    @abstractmethod
    def start(self) -> None:
        """Starts the ASR processing (e.g., in a background thread/task)."""
        pass

    @abstractmethod
    def stop(self) -> None:
        """Stops the ASR processing gracefully."""
        pass

    @abstractmethod
    def is_active(self) -> bool:
         """Returns True if the processor is running."""
         pass

    # No cleanup needed in interface, implementation handles its threads/tasks
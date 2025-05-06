# src/audio_streamer.py
import asyncio
import threading
import time
import traceback
from typing import Optional, Type

from src.handlers.audio.audio_source_handler import AudioSourceHandler
from src.handlers.real_time_asr_interface import RealTimeASRProcessor

class AudioStreamer:
    """Manages audio streaming to a RealTimeASRProcessor."""

    def __init__(self,
                 audio_handler: AudioSourceHandler,
                 asr_processor_cls: Type[RealTimeASRProcessor], # Pass the class
                 asr_config: dict, # Config specific to the ASR processor
                 loop: asyncio.AbstractEventLoop):
        self.audio_handler = audio_handler
        self.asr_processor_cls = asr_processor_cls
        self.asr_config = asr_config
        self.loop = loop
        self._is_streaming = False
        self._stop_event = threading.Event()
        self._audio_capture_thread: Optional[threading.Thread] = None
        self._asr_processor: Optional[RealTimeASRProcessor] = None
        self._audio_queue: Optional[asyncio.Queue] = None
        self.transcript_queue: Optional[asyncio.Queue] = None # Public for runner access
        self._lock = threading.Lock()

    @property
    def is_streaming(self) -> bool:
        with self._lock:
            return self._is_streaming

    async def _create_queue_async(self, size: int) -> asyncio.Queue:
        """Coroutine helper to create queue in the target loop"""
        return asyncio.Queue(maxsize=size)

    def start_streaming(self) -> bool:
        """Starts audio capture and the ASR processor."""
        timestamp = time.strftime('%H:%M:%S')
        with self._lock:
            if self._is_streaming:
                print(f"[{timestamp}] AudioStreamer: Already streaming.")
                return False
            if not self.loop or not self.loop.is_running():
                 print(f"[{timestamp}] AudioStreamer: ERROR - Asyncio loop not running.")
                 return False

            self._is_streaming = True
            self._stop_event.clear()

            print(f"[{timestamp}] AudioStreamer: Starting...")

            # Create queues within the asyncio loop thread
            try:
                 future_audio_q = asyncio.run_coroutine_threadsafe(self._create_queue_async(200), self.loop)
                 future_transcript_q = asyncio.run_coroutine_threadsafe(self._create_queue_async(100), self.loop)
                 self._audio_queue = future_audio_q.result(timeout=2.0)
                 self.transcript_queue = future_transcript_q.result(timeout=2.0)
            except Exception as e:
                 print(f"[{timestamp}] AudioStreamer: Failed to create asyncio queues: {e}")
                 self._is_streaming = False
                 return False

            # Instantiate and start ASR processor
            try:
                 self._asr_processor = self.asr_processor_cls(
                     audio_input_queue=self._audio_queue,
                     sample_rate=self.audio_handler.sample_rate,
                     transcript_output_queue=self.transcript_queue,
                     loop=self.loop, # Pass loop if needed by impl
                     **self.asr_config # Pass specific config like model path
                 )
                 self._asr_processor.start()
                 print(f"[{timestamp}] AudioStreamer: ASR processor started.")
            except Exception as e:
                 print(f"[{timestamp}] AudioStreamer: Failed to start ASR processor: {e}")
                 traceback.print_exc()
                 self._is_streaming = False
                 # Clean up queues if processor failed
                 self._audio_queue = None
                 self.transcript_queue = None
                 return False

            # Start audio capture thread
            self._audio_capture_thread = threading.Thread(
                target=self.audio_handler.stream_audio_to_async_queue,
                args=(self._stop_event, self._audio_queue, self.loop, 'bytes'),
                daemon=True, name="AudioCaptureThread"
            )
            self._audio_capture_thread.start()
            print(f"[{timestamp}] AudioStreamer: Audio capture thread started.")
            return True

    def stop_streaming(self) -> None:
        """Stops audio capture and the ASR processor."""
        timestamp = time.strftime('%H:%M:%S')
        processor_to_stop = None
        capture_thread_to_join = None

        with self._lock:
            if not self._is_streaming:
                return # Nothing to stop

            print(f"[{timestamp}] AudioStreamer: Stopping...")
            self._is_streaming = False # Set state early

            # Signal audio capture thread
            self._stop_event.set()

            processor_to_stop = self._asr_processor
            capture_thread_to_join = self._audio_capture_thread
            self._asr_processor = None
            self._audio_capture_thread = None
            # Keep queue references briefly for cleanup after threads stop

        # Stop processor (outside lock to avoid deadlocks if processor needs lock)
        if processor_to_stop and processor_to_stop.is_active():
            try:
                print(f"[{timestamp}] AudioStreamer: Stopping ASR processor...")
                processor_to_stop.stop()
            except Exception as e:
                print(f"[{timestamp}] AudioStreamer: Error stopping ASR processor: {e}")

        # Join capture thread
        if capture_thread_to_join and capture_thread_to_join.is_alive():
            print(f"[{timestamp}] AudioStreamer: Waiting for capture thread...")
            capture_thread_to_join.join(timeout=1.5)

        # Queues are implicitly cleaned up when references are lost / processor stops
        print(f"[{timestamp}] AudioStreamer: Stopped.")


    def cleanup(self) -> None:
        """Ensures streaming components are stopped."""
        print("AudioStreamer: Cleaning up...")
        # Call stop_streaming which handles threads and processor state
        self.stop_streaming()
        print("AudioStreamer: Cleanup finished.")
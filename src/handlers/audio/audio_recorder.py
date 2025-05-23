# src/audio_recorder.py
import queue
import threading
import time
import traceback
import logging
from typing import Optional, Dict, Any

import numpy as np

from src.types.status_messages import StatusMessage

from .audio_source_handler import AudioSourceHandler
from .convert_wav_to_buffer import save_wav_to_buffer

# Configure logging
logger = logging.getLogger(__name__)


class AudioRecorder:
    """Handles discrete audio recording with VAD."""

    def __init__(
        self,
        audio_handler: AudioSourceHandler,
        vad_config: Dict[str, Any],
        status_queue: Optional[queue.Queue],
    ):
        self.audio_handler = audio_handler
        self.vad_config = vad_config
        self.status_queue = status_queue
        self._is_recording = False
        self._stop_event = threading.Event()
        self._audio_queue: queue.Queue[np.ndarray] = queue.Queue()
        self._recording_thread: Optional[threading.Thread] = None
        self._monitor_thread: Optional[threading.Thread] = (
            None  # Monitor thread belongs here conceptually
        )
        self._audio_buffer: Optional[bytes] = None  # Store result here
        self._processing_callback: Optional[callable] = (
            None  # Callback when audio is ready
        )
        self._lock = threading.Lock()

    @property
    def is_recording(self) -> bool:
        with self._lock:
            return self._is_recording

    def start_recording(self, processing_callback: callable) -> bool:
        """
        Starts recording and monitoring. Calls the callback when audio is ready.

        Args:
            processing_callback: A function to call with the audio buffer (bytes) or None on error/no audio.
        """
        with self._lock:
            if self._is_recording:
                logger.info("AudioRecorder: Already recording.")
                return False

            self._is_recording = True
            self._stop_event.clear()
            self._audio_buffer = None  # Clear previous result
            self._processing_callback = processing_callback

            # Clear queue
            while not self._audio_queue.empty():
                try:
                    self._audio_queue.get_nowait()
                except queue.Empty:
                    break

            logger.info("AudioRecorder: Starting recording...")
            self._update_status(StatusMessage.RECORDING.value)

            self._recording_thread = threading.Thread(
                target=self.audio_handler.record_audio_stream,
                args=(self._stop_event, self._audio_queue),
                daemon=True,
                name="AudioRecordingThread",
            )
            self._monitor_thread = threading.Thread(
                target=self._monitor_target, daemon=True, name="VADMonitorThread"
            )

            self._recording_thread.start()
            self._monitor_thread.start()
            return True

    def _monitor_target(self):
        """Waits for stop signal, collects audio, prepares buffer, and calls callback."""
        timestamp = time.strftime("%H:%M:%S")
        logger.info(f"[{timestamp}] AudioRecorder Monitor: Waiting for stop signal...")
        self._stop_event.wait()  # Wait for VAD or manual stop
        logger.info(f"[{timestamp}] AudioRecorder Monitor: Stop signal received.")

        callback_to_call = None
        with self._lock:
            self._is_recording = False  # Update state under lock
            callback_to_call = self._processing_callback  # Get callback under lock

        # --- Collect Audio ---
        logger.info(f"[{timestamp}] AudioRecorder Monitor: Collecting chunks...")
        chunks = []
        while not self._audio_queue.empty():
            try:
                chunks.append(self._audio_queue.get_nowait())
            except queue.Empty:
                break
        logger.info(
            f"[{timestamp}] AudioRecorder Monitor: Collected {len(chunks)} chunks."
        )

        # --- Prepare Buffer ---
        audio_buffer: Optional[bytes] = None
        if chunks:
            try:
                data = np.concatenate(chunks, axis=0)
                audio_buffer = save_wav_to_buffer(data, self.audio_handler.sample_rate)
                if not audio_buffer:
                    raise ValueError("Buffer creation failed.")
                logger.info(
                    f"[{timestamp}] AudioRecorder Monitor: Audio buffer created ({audio_buffer.__sizeof__()} bytes)."
                )
            except Exception as e:
                logger.error(
                    f"[{timestamp}] AudioRecorder Monitor: Error preparing buffer: {e}"
                )
                traceback.print_exc()  # Added for more detailed error information
                self._update_status(StatusMessage.ERROR_RECORDING.value)
                audio_buffer = None  # Ensure it's None on error
        else:
            logger.info(f"[{timestamp}] AudioRecorder Monitor: No audio collected.")
            self._update_status(StatusMessage.READY.value)

        # --- Trigger Callback ---
        if callback_to_call:
            try:
                logger.info(
                    f"[{timestamp}] AudioRecorder Monitor: Triggering processing callback."
                )
                callback_to_call(audio_buffer)
            except Exception as e:
                logger.error(
                    f"[{timestamp}] AudioRecorder Monitor: Error in processing callback: {e}"
                )
                traceback.print_exc()
        else:
            logger.info(
                f"[{timestamp}] AudioRecorder Monitor: No processing callback set."
            )

    def stop_recording(self):
        """Manually stops the recording."""
        if self.is_recording:  # Check property which uses lock
            logger.info("AudioRecorder: Manual stop requested.")
            self._stop_event.set()

    def _update_status(self, message: str):
        if self.status_queue:
            try:
                self.status_queue.put_nowait(message)
            except Exception:
                pass

    def cleanup(self):
        logger.info("AudioRecorder: Cleaning up...")
        with self._lock:
            is_rec = self._is_recording
            rec_thread = self._recording_thread
            mon_thread = self._monitor_thread

        if is_rec:
            self._stop_event.set()  # Signal stop if recording

        if rec_thread and rec_thread.is_alive():
            rec_thread.join(timeout=1.0)
        if mon_thread and mon_thread.is_alive():
            mon_thread.join(timeout=1.0)

        # Clear queue after threads stopped
        while not self._audio_queue.empty():
            try:
                self._audio_queue.get_nowait()
            except queue.Empty:
                break
        logger.info("AudioRecorder: Cleanup finished.")

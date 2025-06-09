# src/audio_recorder.py
import io
import logging
import queue
import threading
import time
import traceback

import numpy as np

from src.types.status_messages import StatusMessage

from .audio_source_handler import AudioSourceHandler
from .convert_wav_to_buffer import save_wav_to_buffer

# Configure logging
logger = logging.getLogger(__name__)


class AudioRecorder:
    def __init__(
        self,
        audio_handler: AudioSourceHandler,
        status_queue: queue.Queue | None,
    ):
        self.audio_handler = audio_handler
        self.status_queue = status_queue
        self._is_recording = False
        self._stop_event = threading.Event()
        self._audio_queue: queue.Queue[np.ndarray] = queue.Queue()
        self._recording_thread: threading.Thread | None = None
        self._monitor_thread: threading.Thread | None = (
            None  # Monitor thread belongs here conceptually
        )
        self._audio_buffer: bytes | None = None  # Store result here
        self._processing_callback: callable | None = (
            None  # Callback when audio is ready
        )
        self._lock = threading.Lock()
        self._watchdog_thread: threading.Thread | None = None
        self._watchdog_stop_event: threading.Event | None = None
        self._watchdog_timeout_sec = 5.0
        self._audio_detected = False

    @property
    def is_recording(self) -> bool:
        with self._lock:
            return self._is_recording

    def start_recording(
        self, processing_callback: callable, start_time: float = None
    ) -> bool:
        """
        Starts recording and monitoring. Calls the callback when audio is ready.

        Args:
            processing_callback: A function to call with the audio buffer (bytes) or None on error/no audio.
            start_time: float, the timestamp when the hotkey was pressed (for timing diagnostics)
        """
        now = time.time()
        elapsed = now - start_time if start_time else 0.0
        logger.info(
            f"[TIMING] AudioRecorder.start_recording called at {now} (elapsed: {elapsed:.3f}s)"
        )
        with self._lock:
            if self._is_recording:
                logger.info("AudioRecorder: Already recording.")
                return False

            self._stop_event.clear()
            self._audio_buffer = None  # Clear previous result
            self._processing_callback = processing_callback
            self._audio_detected = False  # Reset audio detected flag

            # Clear queue
            while not self._audio_queue.empty():
                try:
                    self._audio_queue.get_nowait()
                except queue.Empty:
                    break

            # Attach audio_detected_callback so AudioSourceHandler can notify us
            self.audio_handler.audio_detected_callback = self.notify_audio_detected

            logger.info("AudioRecorder: Starting recording...")
            self._update_status(StatusMessage.RECORDING.value)

            # Pass start_time to the recording thread via a lambda
            self._recording_thread = threading.Thread(
                target=lambda: self.audio_handler.record_audio_stream(
                    self._stop_event, self._audio_queue, start_time
                ),
                daemon=True,
                name="AudioRecordingThread",
            )
            self._monitor_thread = threading.Thread(
                target=self._monitor_target, daemon=True, name="AudioMonitorThread"
            )

            self._recording_thread.start()
            logger.info(
                f"[TIMING] AudioRecorder recording thread started at {time.time()} (elapsed: {time.time() - start_time if start_time else 0.0:.3f}s)"
            )
            self._monitor_thread.start()

            # --- Start watchdog timer ---
            self._start_watchdog()
            self._is_recording = True
            return True

    def _start_watchdog(self):
        # Stop any previous watchdog
        self._stop_watchdog()
        self._watchdog_stop_event = threading.Event()
        self._watchdog_thread = threading.Thread(
            target=self._watchdog_target, daemon=True, name="AudioWatchdogThread"
        )
        self._watchdog_thread.start()

    def _stop_watchdog(self):
        if self._watchdog_stop_event:
            self._watchdog_stop_event.set()
        if self._watchdog_thread and self._watchdog_thread.is_alive():
            self._watchdog_thread.join(timeout=0.5)
        self._watchdog_thread = None
        self._watchdog_stop_event = None

    def _watchdog_target(self):
        logger.info("AudioRecorder Watchdog: Started.")
        start_time = time.time()
        while not self._watchdog_stop_event.is_set():
            if not self.is_recording:
                logger.info(
                    "AudioRecorder Watchdog: Recording stopped, exiting watchdog."
                )
                return
            if self._audio_detected:
                logger.info("AudioRecorder Watchdog: Audio detected, exiting watchdog.")
                return
            elapsed = time.time() - start_time
            if elapsed > self._watchdog_timeout_sec:
                logger.error(
                    f"AudioRecorder Watchdog: Timeout after {self._watchdog_timeout_sec}s! No audio processed."
                )
                self._update_status(StatusMessage.ERROR_RECORDING.value)
                self.stop_recording()
                return
            time.sleep(0.1)
        logger.info("AudioRecorder Watchdog: Stopped by event.")

    def _monitor_target(self):
        """Waits for stop signal, collects audio, prepares buffer, and calls callback."""
        logger.info("AudioRecorder Monitor: Waiting for stop signal...")
        self._stop_event.wait()
        logger.info("AudioRecorder Monitor: Stop signal received.")

        # --- Stop watchdog when recording ends ---
        self._stop_watchdog()

        callback_to_call = None
        with self._lock:
            self._is_recording = False  # Update state under lock
            callback_to_call = self._processing_callback  # Get callback under lock

        # --- Collect Audio ---
        logger.info("AudioRecorder Monitor: Collecting chunks...")
        chunks = []
        while not self._audio_queue.empty():
            try:
                chunk = self._audio_queue.get_nowait()
                chunks.append(chunk)
            except queue.Empty:
                break
        logger.info(f"AudioRecorder Monitor: Collected {len(chunks)} chunks.")

        # --- Prepare Buffer ---
        audio_buffer: bytes | None = None
        if chunks:
            try:
                data = np.concatenate(chunks, axis=0)
                audio_buffer = save_wav_to_buffer(data, self.audio_handler.sample_rate)
                if not audio_buffer:
                    raise ValueError("Buffer creation failed.")
                logger.info(
                    f"AudioRecorder Monitor: Audio buffer created ({audio_buffer.__sizeof__()} bytes)."
                )
            except Exception as e:
                logger.error(f"AudioRecorder Monitor: Error preparing buffer: {e}")
                traceback.print_exc()  # Added for more detailed error information
                self._update_status(StatusMessage.ERROR_RECORDING.value)
                audio_buffer = None  # Ensure it's None on error
        else:
            logger.info("AudioRecorder Monitor: No audio collected.")
            self._update_status(StatusMessage.READY.value)

        # --- Trigger Callback ---
        if callback_to_call:
            try:
                logger.info("AudioRecorder Monitor: Triggering processing callback.")
                callback_to_call(audio_buffer)
            except Exception as e:
                logger.error(
                    f"AudioRecorder Monitor: Error in processing callback: {e}"
                )
                traceback.print_exc()
        else:
            logger.info("AudioRecorder Monitor: No processing callback set.")

    def stop_recording(self):
        """Manually stops the recording."""
        if self.is_recording:  # Check property which uses lock
            logger.info("AudioRecorder: Manual stop requested.")
            self._stop_event.set()
            self._stop_watchdog()

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

    def notify_audio_detected(self):
        """Called by the audio handler when audio is detected."""
        if not self._audio_detected:
            logger.info("AudioRecorder: Audio detected.")
            with self._lock:
                self._audio_detected = True

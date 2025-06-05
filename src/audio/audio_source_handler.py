import logging
import queue
import threading
import time
from typing import Any

import numpy as np
import sounddevice as sd

from src.audio.audio_device_manager import AudioDeviceManager, DeviceChangeListener
from src.audio.audio_source_interface import AudioSourceInterface

logger = logging.getLogger(__name__)


class AudioSourceHandler(AudioSourceInterface, DeviceChangeListener):
    def __init__(self, sample_rate: int, channels: int):
        super().__init__(sample_rate, channels)
        self._device_manager = AudioDeviceManager.instance()
        self._device_manager.register_listener(self)

        # Add a lock for thread-safe stream access
        self._stream_lock = threading.Lock()

        self._stream: sd.InputStream | None = None
        self._audio_queue: queue.Queue | None = None

        self._reinitialize_stream_event = threading.Event()
        self._stop_recording_event: threading.Event | None = None
        self._stream_is_operational = False

    def on_device_changed(self, new_device_index: int | None):
        logger.info(
            f"Device change notification received. New effective device index: {new_device_index}. Signaling stream re-initialization."
        )
        self._stream_is_operational = False
        self._reinitialize_stream_event.set()

    def _close_existing_stream(self):
        # Acquire the lock to ensure this block is executed by only one thread at a time.
        with self._stream_lock:
            if self._stream is not None:
                try:
                    # It's good practice to check if the stream is already closed before acting on it.
                    if not self._stream.closed:
                        logger.info("Stopping and closing active audio stream...")
                        self._stream.stop()
                        self._stream.close()
                        logger.info("Audio stream stopped and closed.")
                    else:
                        logger.info("Audio stream was already closed.")
                except Exception as e:
                    logger.warning(
                        f"Error stopping/closing audio stream: {e}", exc_info=True
                    )
                finally:
                    # Setting the stream to None should also be within the locked block.
                    self._stream = None
            self._stream_is_operational = False

    def _audio_callback(
        self, indata: np.ndarray, frames: int, time_info: Any, status: sd.CallbackFlags
    ):
        if status:
            logger.warning(f"Sounddevice callback status: {status}")
            if status.input_overflow:
                logger.error(
                    "Input overflow detected in audio callback! Audio data may be lost."
                )
            if status.input_underflow:
                logger.warning("Input underflow detected in audio callback.")

        if self._audio_queue is not None:
            try:
                self._audio_queue.put_nowait(indata.copy())
                if hasattr(self._audio_queue, "audio_detected_callback") and callable(
                    self._audio_queue.audio_detected_callback
                ):
                    self._audio_queue.audio_detected_callback()
            except queue.Full:
                logger.warning(
                    "Audio queue is full. Dropping audio frame.", throttle_duration_s=5
                )
        else:
            logger.warning("Audio queue is None in callback. Cannot queue audio data.")

    def _get_and_prepare_device_for_stream(self) -> int | None:
        current_device_idx = self._device_manager.get_current_device_index()

        if current_device_idx is None:
            logger.warning("No current audio device in manager. Attempting recovery...")
            if not self._device_manager.attempt_to_recover_device():
                logger.error(
                    "Initial device recovery failed. Cannot prepare device for stream."
                )
                return None
            current_device_idx = self._device_manager.get_current_device_index()
            if current_device_idx is None:
                logger.error("Still no audio device after initial recovery attempt.")
                return None

        is_valid, error_msg = self._device_manager.verify_device_is_suitable_input(
            current_device_idx
        )
        if not is_valid:
            logger.error(
                f"Device {self._device_manager.get_current_device_name()} (Index {current_device_idx}) is not valid: {error_msg}. Attempting recovery."
            )
            if not self._device_manager.attempt_to_recover_device(
                failed_device_index=current_device_idx
            ):
                logger.error("Recovery failed after selected device was found invalid.")
                return None
            current_device_idx = self._device_manager.get_current_device_index()
            if current_device_idx is None:
                logger.error("Recovery did not yield a usable device.")
                return None

            is_valid_after_recovery, new_error_msg = (
                self._device_manager.verify_device_is_suitable_input(current_device_idx)
            )
            if not is_valid_after_recovery:
                logger.error(
                    f"Newly recovered device {self._device_manager.get_current_device_name()} (Index {current_device_idx}) is also invalid: {new_error_msg}."
                )
                return None

        logger.info(
            f"Prepared device for stream: {self._device_manager.get_current_device_name()} (Index {current_device_idx})"
        )
        return current_device_idx

    def _attempt_to_initialize_stream(self, start_time: float = None) -> bool:
        logger.info("Attempting to initialize audio stream...")
        self._close_existing_stream()

        target_device_index = self._get_and_prepare_device_for_stream()

        if target_device_index is None:
            logger.error(
                "Cannot initialize stream: No suitable audio device available after checks/recovery."
            )
            self._stream_is_operational = False
            return False

        device_name = (
            self._device_manager.get_current_device_name()
            or f"Device {target_device_index}"
        )
        logger.info(
            f"Attempting to start InputStream on: {device_name} (Index: {target_device_index})"
        )

        with self._stream_lock:  # Protect stream creation
            try:
                self._stream = sd.InputStream(
                    samplerate=self.sample_rate,
                    channels=self.channels,
                    dtype=np.int16,
                    blocksize=0,
                    device=target_device_index,
                    latency="low",
                    callback=self._audio_callback,
                )
                self._stream.start()
                logger.info(
                    f"[TIMING] InputStream started at {time.time()} on device {device_name} (elapsed: {time.time() - start_time if start_time else 0.0:.3f}s)"
                )
                self._stream_is_operational = True
                return True
            except sd.PortAudioError as pae:
                logger.error(
                    f"PortAudioError initializing stream on {device_name} (Index {target_device_index}): {pae}",
                    exc_info=True,
                )
                logger.info(
                    f"Stream creation failed for {device_name}. Triggering recovery, marking index {target_device_index} as failed."
                )
                self._device_manager.attempt_to_recover_device(
                    failed_device_index=target_device_index
                )
                self._reinitialize_stream_event.set()
            except Exception as e:
                logger.error(
                    f"Unexpected error initializing stream on {device_name} (Index {target_device_index}): {e}",
                    exc_info=True,
                )
                logger.info(
                    f"Unexpected stream error for {device_name}. Triggering recovery, marking index {target_device_index} as failed."
                )
                self._device_manager.attempt_to_recover_device(
                    failed_device_index=target_device_index
                )
                self._reinitialize_stream_event.set()

        self._stream_is_operational = False
        return False

    def record_audio_stream(
        self,
        stop_event: threading.Event,
        audio_queue: queue.Queue,
        start_time: float = None,
    ):
        logger.info(
            f"[TIMING] AudioSourceHandler.record_audio_stream called at {time.time()} (elapsed: {time.time() - start_time if start_time else 0.0:.3f}s)"
        )
        self._audio_queue = audio_queue
        self._stop_recording_event = stop_event
        self._reinitialize_stream_event.clear()
        self._stream_is_operational = False

        logger.info("Audio recording loop started.")

        if not self._attempt_to_initialize_stream(start_time=start_time):
            logger.warning(
                "Initial stream initialization failed. Waiting for re-initialize event or stop signal."
            )

        while not self._stop_recording_event.is_set():
            reinit_signaled = self._reinitialize_stream_event.wait(timeout=0.1)

            if self._stop_recording_event.is_set():
                break

            if reinit_signaled:
                logger.info(
                    "Re-initialization event detected. Attempting to re-initialize stream."
                )
                self._reinitialize_stream_event.clear()
                if not self._attempt_to_initialize_stream(start_time=start_time):
                    logger.error("Stream re-initialization failed. Will retry or stop.")
                    if not self._stop_recording_event.wait(timeout=1.0):
                        continue
                    else:
                        break
                continue

            with self._stream_lock:
                if self._stream_is_operational and (
                    self._stream is None or self._stream.closed
                ):
                    logger.warning(
                        "Stream was marked operational but found to be None or closed. Signaling re-initialization."
                    )
                    self._stream_is_operational = False
                    self._reinitialize_stream_event.set()

        logger.info("Audio recording loop has been stopped.")
        self._close_existing_stream()
        self._audio_queue = None
        logger.info(
            f"[TIMING] AudioSourceHandler.record_audio_stream exiting at {time.time()} (elapsed: {time.time() - start_time if start_time else 0.0:.3f}s)"
        )
        logger.info(
            "Audio source handler finished recording and cleaned up stream resources."
        )

    def cleanup(self):
        logger.info("AudioSourceHandler cleanup initiated.")
        if self._stop_recording_event and not self._stop_recording_event.is_set():
            logger.debug("Setting stop event during cleanup.")
            self._stop_recording_event.set()

        self._close_existing_stream()

        if self._device_manager:
            try:
                self._device_manager.unregister_listener(self)
                logger.info("Unregistered as listener from AudioDeviceManager.")
            except Exception as e:
                logger.warning(
                    f"Error unregistering listener from AudioDeviceManager: {e}"
                )

        logger.info("AudioSourceHandler cleanup complete.")

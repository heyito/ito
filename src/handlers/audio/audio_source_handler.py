import logging
import time

import numpy as np
import sounddevice as sd
import webrtcvad

from src.handlers.audio.audio_source_interface import AudioSourceInterface
from src.ui.keyboard_manager import KeyboardManager

logger = logging.getLogger("AudioSourceHandler")

class AudioSourceHandler(AudioSourceInterface):
    def __init__(self, sample_rate: int, channels: int, device_index: int):
        super().__init__(sample_rate, channels, device_index)
        self._last_queue_full_log_time: float = 0.0
        self._queue_full_log_cooldown_seconds: float = 5.0
        self._keyboard_manager = KeyboardManager.instance()

    def record_audio_stream_with_vad(self, stop_event, audio_queue, vad_config):
        if not webrtcvad:
            logger.warning("VAD disabled because webrtcvad is not available.")
            vad_config["enabled"] = False  # Force disable if library missing

        # Get VAD settings safely from the passed dictionary
        vad_enabled = vad_config.get("enabled", True)
        vad_aggressiveness = vad_config.get("aggressiveness", 1)
        vad_silence_duration_ms = vad_config.get("silence_duration_ms", 1500)
        vad_frame_duration_ms = vad_config.get("frame_duration_ms", 30)

        # Validate VAD parameters
        if vad_enabled:
            if self.sample_rate not in [8000, 16000, 32000, 48000]:
                logger.error(
                    f"Sample rate {self.sample_rate}Hz not supported by webrtcvad. Disabling VAD."
                )
                vad_enabled = False
            if vad_frame_duration_ms not in [10, 20, 30]:
                logger.error(
                    f"VAD frame duration {vad_frame_duration_ms}ms not supported. Must be 10, 20, or 30. Disabling VAD."
                )
                vad_enabled = False

        # Calculate VAD frame size in samples and bytes
        samples_per_vad_frame = int(self.sample_rate * vad_frame_duration_ms / 1000)
        bytes_per_vad_frame = (
            samples_per_vad_frame * self.channels * np.dtype(np.int16).itemsize
        )  # PCM16 = 2 bytes

        # Sounddevice block size - use exactly the VAD frame size for lowest latency
        # This means we'll process audio in smaller chunks but with lower latency
        blocksize = (
            samples_per_vad_frame  # Changed from *2 to match VAD frame size exactly
        )
        dtype = np.int16

        vad_instance = None
        if vad_enabled:
            try:
                vad_instance = webrtcvad.Vad(vad_aggressiveness)
                logger.info(
                    f"VAD Enabled: Aggressiveness={vad_aggressiveness}, Silence Duration={vad_silence_duration_ms}ms, Frame={vad_frame_duration_ms}ms"
                )
            except Exception as e:
                logger.error(f"Error initializing VAD: {e}. Disabling VAD.")
                vad_enabled = False

        else:
            logger.info("VAD disabled. Listening for hotkey release.")

            def _handle_hotkey_release(_: str) -> None:
                if not vad_enabled:
                    logger.info("VAD disabled. Listening for hotkey release.")
                    stop_event.set()

            self._keyboard_manager.hotkey_released.connect(_handle_hotkey_release)

        # Track consecutive silence time for VAD decision
        speech_detected_recently = False
        silence_start_time = None

        # Buffer for incomplete VAD frames between sounddevice blocks
        vad_buffer = bytearray()

        def callback(indata, frames, time_info, status):
            """Sounddevice callback. Puts data in queue and performs VAD checks."""
            nonlocal vad_buffer, speech_detected_recently, silence_start_time
            if status:
                logger.warning(f"Sounddevice status: {status}")

            # Always queue the raw audio data first
            audio_queue.put(indata.copy())

            # --- VAD Logic ---
            if vad_enabled and vad_instance:
                try:
                    # Ensure data is in bytes, int16 format expected by VAD
                    audio_data_bytes = indata.tobytes()
                    vad_buffer.extend(audio_data_bytes)
                    is_speech_in_block = False

                    # Process buffer in VAD frame sizes
                    while len(vad_buffer) >= bytes_per_vad_frame:
                        frame_bytes = vad_buffer[:bytes_per_vad_frame]
                        del vad_buffer[:bytes_per_vad_frame]

                        # VAD check (expects PCM16)
                        if vad_instance.is_speech(frame_bytes, self.sample_rate):
                            is_speech_in_block = True
                            # Break if one frame is speech, the whole block is considered speech.
                            # Depending on VAD frame size vs. blocksize, might want to process all frames
                            # For now, one positive VAD frame makes the block positive.

                    # Update silence tracking based on block-level speech detection
                    if is_speech_in_block:
                        if (
                            not speech_detected_recently
                        ):  # Check *before* updating speech_detected_recently
                            logger.info(
                                "Initial speech detected by VAD. Silence timeout is now active upon subsequent silence."
                            )
                        speech_detected_recently = True
                        silence_start_time = (
                            None  # Reset silence timer as speech is active
                        )
                        logger.debug("VAD: Speech currently active.")
                    else:  # No speech in this entire block
                        if (
                            speech_detected_recently
                        ):  # Only if speech had occurred at some point
                            if (
                                silence_start_time is None
                            ):  # Start timer if it's not already running for this silence period
                                silence_start_time = time.monotonic()

                            # This check is important as silence_start_time might have been set in a previous silent block
                            if silence_start_time is not None:
                                elapsed_silence = (
                                    time.monotonic() - silence_start_time
                                ) * 1000  # ms
                                logger.debug(
                                    f"VAD State: Silent for {elapsed_silence:.0f}ms (threshold {vad_silence_duration_ms}ms)."
                                )
                                if elapsed_silence >= vad_silence_duration_ms:
                                    logger.info(
                                        f"Silence duration ({elapsed_silence:.0f}ms) exceeded threshold ({vad_silence_duration_ms}ms). Stopping recording."
                                    )
                                    if not stop_event.is_set():
                                        stop_event.set()  # Signal to stop

                except Exception as e:
                    logger.error(f"Error during VAD processing in callback: {e}")

        # --- Stream Execution ---
        try:
            logger.info(
                f"Attempting to open stream: device={self.device_index}, rate={self.sample_rate}, channels={self.channels}, blocksize={blocksize}"
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
                # Keep the stream alive until stop_event is set by VAD or external signal
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

    def record_audio_stream(self, stop_event, audio_queue):
        def callback(indata, frames, time_info, status):
            """Sounddevice callback. Puts data in queue and performs VAD checks."""
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
                # Keep the stream alive until stop_event is set by VAD or external signal
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

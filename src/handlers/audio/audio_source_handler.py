import logging
import threading
from typing import Literal
from src.handlers.audio.audio_source_interface import AudioSourceInterface
import webrtcvad
import numpy as np
import sounddevice as sd
import asyncio
import time

logger = logging.getLogger("AudioSourceHandler")

class AudioSourceHandler(AudioSourceInterface):
    def __init__(self, sample_rate: int, channels: int, device_index: int):
        super().__init__(sample_rate, channels, device_index)
        self._last_queue_full_log_time: float = 0.0
        self._queue_full_log_cooldown_seconds: float = 5.0

    def record_audio_stream_with_vad(self, stop_event, audio_queue, vad_config):
        if not webrtcvad:
            print("VAD disabled because webrtcvad is not available.")
            vad_config['enabled'] = False # Force disable if library missing

        # Get VAD settings safely from the passed dictionary
        vad_enabled = vad_config.get('enabled', True)
        vad_aggressiveness = vad_config.get('aggressiveness', 1)
        vad_silence_duration_ms = vad_config.get('silence_duration_ms', 1500)
        vad_frame_duration_ms = vad_config.get('frame_duration_ms', 30)

        # Validate VAD parameters
        if vad_enabled:
            if self.sample_rate not in [8000, 16000, 32000, 48000]:
                print(f"Error: Sample rate {self.sample_rate}Hz not supported by webrtcvad. Disabling VAD.")
                vad_enabled = False
            if vad_frame_duration_ms not in [10, 20, 30]:
                print(f"Error: VAD frame duration {vad_frame_duration_ms}ms not supported. Must be 10, 20, or 30. Disabling VAD.")
                vad_enabled = False

        # Calculate VAD frame size in samples and bytes
        samples_per_vad_frame = int(self.sample_rate * vad_frame_duration_ms / 1000)
        bytes_per_vad_frame = samples_per_vad_frame * self.channels * np.dtype(np.int16).itemsize # PCM16 = 2 bytes

        # Sounddevice block size - use exactly the VAD frame size for lowest latency
        # This means we'll process audio in smaller chunks but with lower latency
        blocksize = samples_per_vad_frame  # Changed from *2 to match VAD frame size exactly
        dtype = np.int16

        vad_instance = None
        if vad_enabled:
            try:
                vad_instance = webrtcvad.Vad(vad_aggressiveness)
                print(f"VAD Enabled: Aggressiveness={vad_aggressiveness}, Silence Duration={vad_silence_duration_ms}ms, Frame={vad_frame_duration_ms}ms")
            except Exception as e:
                print(f"Error initializing VAD: {e}. Disabling VAD.")
                vad_enabled = False

        # Track consecutive silence time for VAD decision
        speech_detected_recently = False
        silence_start_time = None

        # Buffer for incomplete VAD frames between sounddevice blocks
        vad_buffer = bytearray()

        def callback(indata, frames, time_info, status):
            """Sounddevice callback. Puts data in queue and performs VAD checks."""
            nonlocal vad_buffer, speech_detected_recently, silence_start_time
            if status:
                print(f"Sounddevice status: {status}", flush=True)

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
                        if not speech_detected_recently: # Check *before* updating speech_detected_recently
                            print("\nInitial speech detected by VAD. Silence timeout is now active upon subsequent silence.")
                        speech_detected_recently = True
                        silence_start_time = None # Reset silence timer as speech is active
                        print("VAD: Speech currently active.", end='\r')
                    else: # No speech in this entire block
                        if speech_detected_recently: # Only if speech had occurred at some point
                            if silence_start_time is None: # Start timer if it's not already running for this silence period
                                silence_start_time = time.monotonic()
                            
                            # This check is important as silence_start_time might have been set in a previous silent block
                            if silence_start_time is not None: 
                                elapsed_silence = (time.monotonic() - silence_start_time) * 1000 # ms
                                print(f"VAD State: Silent for {elapsed_silence:.0f}ms (threshold {vad_silence_duration_ms}ms).", end='\r')
                                if elapsed_silence >= vad_silence_duration_ms:
                                    print(f"\nSilence duration ({elapsed_silence:.0f}ms) exceeded threshold ({vad_silence_duration_ms}ms). Stopping recording.")
                                    if not stop_event.is_set():
                                            stop_event.set() # Signal to stop

                except Exception as e:
                    print(f"\nError during VAD processing in callback: {e}")

        # --- Stream Execution ---
        try:
            print(f"Attempting to open stream: device={self.device_index}, rate={self.sample_rate}, channels={self.channels}, blocksize={blocksize}")
            stream_start_time = time.monotonic()
            with sd.InputStream(samplerate=self.sample_rate,
                            channels=self.channels,
                            dtype=dtype,
                            blocksize=blocksize,
                            device=self.device_index,
                            latency='low',
                            callback=callback):
                stream_init_time = time.monotonic() - stream_start_time
                print(f"Audio stream opened in {stream_init_time*1000:.1f}ms. Recording... (Waiting for speech and subsequent silence)")
                # Keep the stream alive until stop_event is set by VAD or external signal
                while not stop_event.is_set():
                    time.sleep(0.1)
                print("Stop event received by recording stream loop.")

        except sd.PortAudioError as e:
            print(f"\nPortAudio Error: {e}")
            stop_event.set()
            raise
        except Exception as e:
            print(f"An unexpected error occurred in the audio stream: {e}")
            stop_event.set()
            raise
        finally:
            print("Audio stream closed.")

    def stream_audio_to_async_queue(self,
                                  stop_event: threading.Event,
                                  async_queue: asyncio.Queue,
                                  loop: asyncio.AbstractEventLoop,
                                  output_format: Literal['numpy', 'bytes'] = 'bytes'):
        
        try: # Ensure the entire operational part of the method is within a try block
            if output_format not in ['numpy', 'bytes']:
                print(f"DEBUG AudioSourceHandler: Invalid output_format {output_format}")
                logger.error(f"Invalid output_format '{output_format}'. Must be 'numpy' or 'bytes'.")
                raise ValueError("Invalid output_format")
            
            dtype = np.int16 # Required for Vosk (PCM16)
            blocksize_ms = 40
            # Calculate the desired blocksize in samples based on blocksize_ms
            calculated_blocksize = int(self.sample_rate * blocksize_ms / 1000)

            # ===== DEBUG PRINT: Config =====
            # print(f"DEBUG AudioSourceHandler: Config - Requested blocksize=0 (auto), output_format={output_format}, requested_latency='low'")
            # logger.info(f"Streaming with requested blocksize=0 (auto) and latency='low'. Outputting audio as: {output_format}")
            print(f"DEBUG AudioSourceHandler: Config - Calculated blocksize={calculated_blocksize} samples ({blocksize_ms}ms), output_format={output_format}, requested_latency='low'")
            logger.info(f"Streaming with calculated_blocksize={calculated_blocksize} samples ({blocksize_ms}ms) and latency='low'. Outputting audio as: {output_format}")

            def _put_audio_chunk_to_queue(chunk_data):
                try:
                    async_queue.put_nowait(chunk_data)
                except asyncio.QueueFull:
                    current_time = time.monotonic()
                    if (current_time - self._last_queue_full_log_time) > self._queue_full_log_cooldown_seconds:
                        logger.warning("Asyncio audio queue full! Audio data chunk dropped. Logging new occurrences every %.1f sec.", self._queue_full_log_cooldown_seconds, exc_info=False)
                        self._last_queue_full_log_time = current_time
                except Exception as e_put_internal: # Catch other errors from put_nowait
                    logger.error(f"Error in _put_audio_chunk_to_queue: {e_put_internal}", exc_info=True)

            def callback(indata: np.ndarray, frames: int, time_info, status: sd.CallbackFlags):
                if status:
                    logger.warning(f"Sounddevice status (streaming): {status}")

                try:
                    if output_format == 'bytes':
                        audio_chunk = indata.tobytes()
                    else: # output_format == 'numpy'
                        audio_chunk = indata.copy()
                except Exception as e_conv:
                    # ===== DEBUG PRINT: Callback Conversion Error =====
                    # print(f"DEBUG AudioSourceHandler: Error converting audio chunk in callback: {e_conv}") # Reduced verbosity
                    logger.error(f"Error converting audio chunk in callback: {e_conv}")
                    return 

                try:
                    # Schedule the helper function to run in the event loop
                    loop.call_soon_threadsafe(_put_audio_chunk_to_queue, audio_chunk)
                except Exception as e_put_schedule: # Error scheduling the call
                    # ===== DEBUG PRINT: Callback Queue Put Error =====
                    # print(f"DEBUG AudioSourceHandler: Error putting audio chunk onto queue in callback: {e_put}") # Name change e_put -> e_put_schedule
                    logger.error(f"Error scheduling put of audio chunk onto queue in callback: {e_put_schedule}", exc_info=True)

            print(f"DEBUG AudioSourceHandler: Attempting to open sd.InputStream at {time.time()}")
            default_input_device = sd.default.device[0] if isinstance(sd.default.device, (list, tuple)) else sd.default.device
            actual_device_index = self.device_index if self.device_index is not None else default_input_device
            logger.info(f"Attempting to open stream (async streaming mode): device={actual_device_index}, rate={self.sample_rate}, channels={self.channels}, blocksize={calculated_blocksize}, latency='low'")
            stream_open_start_time = time.monotonic()
            with sd.InputStream(samplerate=self.sample_rate,
                            channels=self.channels,
                            dtype=dtype,
                            blocksize=calculated_blocksize, # Use the calculated blocksize
                            device=self.device_index,
                            latency='low',
                            callback=callback) as stream:
                stream_open_duration = (time.monotonic() - stream_open_start_time) * 1000
                actual_latency_ms = stream.latency * 1000
                actual_blocksize_samples = stream.blocksize
                actual_block_duration_ms = (actual_blocksize_samples / self.sample_rate) * 1000

                log_msg = (f"Audio stream opened in {stream_open_duration:.2f} ms. "
                           f"Actual negotiated latency: {actual_latency_ms:.2f} ms. "
                           f"Actual blocksize: {actual_blocksize_samples} samples ({actual_block_duration_ms:.2f} ms). "
                           f"Streaming...")
                logger.info(log_msg)
                print(f"DEBUG AudioSourceHandler: {log_msg}")
                while not stop_event.is_set():
                    stop_event.wait(timeout=0.2)

                logger.info("Stop event received by async streaming loop.")

        except sd.PortAudioError as pae:
            logger.error(f"PortAudio Error (async streaming mode): {pae}")
            # Signal stop if an error occurs
            if not stop_event.is_set(): stop_event.set()
            # If the loop isn't running, we can't put None, but the consumer should handle this
            if loop.is_running(): loop.call_soon_threadsafe(async_queue.put_nowait, None)
            raise
        except ValueError as ve:
             if not stop_event.is_set(): stop_event.set()
             if loop.is_running(): loop.call_soon_threadsafe(async_queue.put_nowait, None)
             raise
        except Exception as e:
            logger.error(f"An unexpected error occurred in the async audio stream: {e}", exc_info=True)
            if not stop_event.is_set(): stop_event.set()
            if loop.is_running(): loop.call_soon_threadsafe(async_queue.put_nowait, None)
            raise # Re-raise general exceptions
        finally:
            logger.info("Audio stream closing (async streaming mode).")
            # Ensure None is put in the queue upon normal exit if loop still running
            if stop_event.is_set() and loop.is_running():
                 # Check if None might have already been put by an error handler
                 # This is hard to guarantee perfectly without more complex state.
                 # Putting None again is usually harmless if the consumer handles it.
                 # ===== DEBUG PRINT: Putting None Sentinel =====
                 print(f"DEBUG AudioSourceHandler: Putting final None sentinel onto queue at {time.time()}")
                 logger.info("Putting final None sentinel onto queue.")
                 loop.call_soon_threadsafe(async_queue.put_nowait, None)
            elif not loop.is_running():
                 # ===== DEBUG PRINT: Loop Not Running for None =====
                 print(f"DEBUG AudioSourceHandler: Asyncio loop stopped before None could be reliably put on audio queue at {time.time()}")
                 logger.warning("Asyncio loop stopped before None could be reliably put on audio queue.")

import sounddevice as sd
import numpy as np
import queue
import scipy.io.wavfile as wavfile
import io
import time
import collections
from typing import Optional # Import Optional

# Import VAD library safely
try:
    import webrtcvad
except ImportError:
    print("Warning: webrtcvad library not found. VAD functionality will be disabled.")
    print("Install it using: pip install webrtcvad-wheels")
    webrtcvad = None

class AudioHandler:
    def __init__(self, sample_rate: int, channels: int, device_index: int):
        # Assign required values directly
        self.sample_rate = sample_rate
        self.channels = channels

        # Retrieve optional device_index from provider
        raw_device_index_str = device_index
        self.device_index = None # Default to None
        if raw_device_index_str:
            try:
                self.device_index = int(raw_device_index_str)
            except (ValueError, TypeError):
                print(f"Warning: Invalid device_index '{raw_device_index_str}' in config. Using default (None).")

        # Add validation for required values if needed
        if not isinstance(self.sample_rate, int) or self.sample_rate <= 0:
             print(f"ERROR: Invalid sample_rate: {self.sample_rate}. Cannot continue.")
             raise ValueError("Invalid sample_rate")
        if not isinstance(self.channels, int) or self.channels <= 0:
             print(f"ERROR: Invalid channels: {self.channels}. Cannot continue.")
             raise ValueError("Invalid channels")

        # Print initialized values
        print(f"AudioHandler Initialized: Rate={self.sample_rate}, Channels={self.channels}, Device={self.device_index}")

    def record_audio_stream_with_vad(self, stop_event, audio_queue, vad_config):
        """
        Continuously records audio, putting chunks into a queue.
        Uses VAD to set stop_event after a period of silence.
        Accepts VAD configuration dictionary.
        """
        # Use passed-in config values
        device_index = self.device_index
        sample_rate = self.sample_rate
        channels = self.channels

        if not webrtcvad:
            print("VAD disabled because webrtcvad is not available.")
            vad_config['enabled'] = False # Force disable if library missing

        # Get VAD settings safely from the passed dictionary
        vad_enabled = vad_config.get('enabled', False)
        vad_aggressiveness = vad_config.get('aggressiveness', 1)
        vad_silence_duration_ms = vad_config.get('silence_duration_ms', 1500)
        vad_frame_duration_ms = vad_config.get('frame_duration_ms', 30)

        # Validate VAD parameters
        if vad_enabled:
            if sample_rate not in [8000, 16000, 32000, 48000]:
                print(f"Error: Sample rate {sample_rate}Hz not supported by webrtcvad. Disabling VAD.")
                vad_enabled = False
            if vad_frame_duration_ms not in [10, 20, 30]:
                print(f"Error: VAD frame duration {vad_frame_duration_ms}ms not supported. Must be 10, 20, or 30. Disabling VAD.")
                vad_enabled = False

        # Calculate VAD frame size in samples and bytes
        samples_per_vad_frame = int(sample_rate * vad_frame_duration_ms / 1000)
        bytes_per_vad_frame = samples_per_vad_frame * channels * np.dtype(np.int16).itemsize # PCM16 = 2 bytes

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
                        if vad_instance.is_speech(frame_bytes, sample_rate):
                            is_speech_in_block = True
                            silence_start_time = None # Reset silence timer on speech
                            # print("VAD: Speech detected", end='\r')

                    # Update silence tracking based on block-level speech detection
                    if is_speech_in_block:
                        speech_detected_recently = True
                        silence_start_time = None
                        # print("VAD State: Speech           ", end='\r')
                    else: # No speech in this entire block
                        if speech_detected_recently: # Was speaking recently, now potentially silent
                            if silence_start_time is None:
                                silence_start_time = time.monotonic()
                                # print("VAD State: Silence starting...", end='\r')
                        # Else: still silent, do nothing until timeout

                        # Check for silence timeout ONLY if we've detected speech before
                        # This prevents stopping immediately if recording starts in silence
                        if speech_detected_recently and silence_start_time is not None:
                            elapsed_silence = (time.monotonic() - silence_start_time) * 1000 # ms
                            # print(f"VAD State: Silent for {elapsed_silence:.0f} ms", end='\r')
                            if elapsed_silence >= vad_silence_duration_ms:
                                print(f"\nSilence duration ({elapsed_silence:.0f}ms) exceeded threshold ({vad_silence_duration_ms}ms). Stopping recording.")
                                if not stop_event.is_set():
                                        stop_event.set() # Signal to stop
                                return # Stop processing further in this callback once stopped

                except Exception as e:
                    print(f"\nError during VAD processing in callback: {e}")
                    # Potentially disable VAD or stop recording on error? For now, just print.

        # --- Stream Execution ---
        try:
            print(f"Attempting to open stream: device={device_index}, rate={sample_rate}, channels={channels}, blocksize={blocksize}")
            stream_start_time = time.monotonic()
            with sd.InputStream(samplerate=sample_rate,
                            channels=channels,
                            dtype=dtype,
                            blocksize=blocksize,
                            device=device_index,
                            latency='low',  # Request low latency mode
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

    @staticmethod
    def save_wav_to_buffer(audio_data_numpy, sample_rate, channels):
        """Save audio data to a WAV file in memory buffer.
        
        Args:
            audio_data_numpy: NumPy array containing audio samples
            sample_rate: Sample rate in Hz
            channels: Number of audio channels
            
        Returns:
            BytesIO buffer containing WAV file data, or None if failed
        """
        if not isinstance(audio_data_numpy, np.ndarray) or audio_data_numpy.size == 0:
            print("Error: Invalid or empty audio data provided for saving.")
            return None
        try:
            buffer = io.BytesIO()
            # Ensure data is int16 for standard WAV format
            # Convert float data to int16 with proper scaling
            if audio_data_numpy.dtype != np.int16:
                if np.issubdtype(audio_data_numpy.dtype, np.floating):
                    audio_data_numpy = (audio_data_numpy * 32767).astype(np.int16)
                else:
                    audio_data_numpy = audio_data_numpy.astype(np.int16)

            wavfile.write(buffer, sample_rate, audio_data_numpy)
            buffer.seek(0) # Rewind buffer to the beginning for reading
            return buffer
        except Exception as e:
            print(f"Error saving audio to WAV buffer: {e}")
            return None
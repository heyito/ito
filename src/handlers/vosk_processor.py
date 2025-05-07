# src/processing/vosk_processor.py (New File)
import asyncio
import json
import queue
import threading
import time
import traceback

try:
    import vosk
except ImportError:
    print("Vosk library not found. Please install it: pip install vosk")
    print("You also need to download a Vosk model: https://alphacephei.com/vosk/models")
    raise

import logging

logger = logging.getLogger("VoskProcessor")

class VoskProcessor:
    def __init__(self,
                 model_path: str,
                 sample_rate: int,
                 audio_input_queue: asyncio.Queue,
                 transcript_output_queue: asyncio.Queue,
                 loop: asyncio.AbstractEventLoop):
        """
        Initializes the Vosk processor.

        Args:
            model_path: Path to the Vosk language model directory.
            sample_rate: Sample rate of the incoming audio (e.g., 16000).
            audio_input_queue: Asyncio queue to receive audio chunks (bytes) from.
            transcript_output_queue: Asyncio queue to send transcript results (dict) to.
            loop: The asyncio event loop for scheduling tasks from the thread.
        """
        self.model_path = model_path
        self.sample_rate = sample_rate
        self.audio_input_queue = audio_input_queue
        self.transcript_output_queue = transcript_output_queue
        self.loop = loop
        self.stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._recognizer: vosk.KaldiRecognizer | None = None
        self._model: vosk.Model | None = None

        # Load model immediately to catch errors early
        try:
            logger.info(f"Loading Vosk model from: {model_path}")
            self._model = vosk.Model(model_path)
            self._recognizer = vosk.KaldiRecognizer(self._model, self.sample_rate)
            self._recognizer.SetWords(True) # Enable word timestamps if needed later
            self._recognizer.SetPartialWords(True) # Enable partial word results
            logger.info("Vosk model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load Vosk model from '{model_path}': {e}", exc_info=True)
            raise # Re-raise the exception to prevent starting

    def _processing_loop(self):
        """The main loop running in the background thread."""

        while not self.stop_event.is_set():
            loop_start_time = time.monotonic()
            try:
                # print("VOSK_DIAG: Attempting to get data from audio_input_queue...") # DIAGNOSTIC PRINT - Removed for clarity
                get_coro_start_time = time.monotonic()
                future = asyncio.run_coroutine_threadsafe(self.audio_input_queue.get(), self.loop)
                wait_start_time = time.monotonic()
                data = None
                try:
                     data = future.result(timeout=0.1)
                except TimeoutError:
                     continue
                except Exception as e:
                     print(f"VOSK_DIAG: Error getting data from audio queue: {e}") # Kept for critical errors
                     time.sleep(0.1)
                     continue

                if data is None:
                    logger.info("Received None (EOS) from audio queue. Finalizing recognition.")
                    break

                if not isinstance(data, bytes):
                    print(f"VOSK_DIAG: Received non-bytes data from queue: {type(data)}. Skipping.")
                    continue

                accept_start_time = time.monotonic()
                is_final_result_detected = self._recognizer.AcceptWaveform(data)
                accept_duration = (time.monotonic() - accept_start_time) * 1000

                if is_final_result_detected:
                    result_get_start_time = time.monotonic()
                    final_result_json = self._recognizer.Result()
                    result_get_duration = (time.monotonic() - result_get_start_time) * 1000
                    final_result = json.loads(final_result_json)
                    if final_result.get("text"):
                        print(f"VOSK_DIAG_FINAL: Base AcceptWaveform: {accept_duration:.2f}ms, Result() call: {result_get_duration:.2f}ms. Text: '{final_result['text']}'")
                        result_data = {"text": final_result["text"], "is_final": True}
                        put_start_time = time.monotonic()
                        asyncio.run_coroutine_threadsafe(self.transcript_output_queue.put(result_data), self.loop)
                        put_duration = (time.monotonic() - put_start_time) * 1000
                        print(f"VOSK_DIAG_FINAL: Put transcript took {put_duration:.2f} ms.")

                pass

            except queue.Empty:
                # Queue was empty, wait a bit
                time.sleep(0.01)
                continue
            except Exception as e:
                logger.error(f"Error in Vosk processing loop: {e}")
                traceback.print_exc()
                time.sleep(0.1) # Avoid spamming logs on continuous error

        # --- Loop finished ---
        logger.info("Processing loop finished. Getting final result.")
        try:
            final_result_json = self._recognizer.FinalResult()
            final_result = json.loads(final_result_json)
            if final_result.get("text"):
                 logger.info(f"Vosk Final Result (at stop): {final_result['text']}")
                 result_data = {"text": final_result["text"], "is_final": True}
                 # Ensure final result is sent
                 asyncio.run_coroutine_threadsafe(self.transcript_output_queue.put(result_data), self.loop)

        except Exception as e:
            logger.error(f"Error getting final Vosk result: {e}")

        logger.info("Vosk processing thread stopped.")


    def start(self):
        """Starts the background processing thread."""
        if self._thread is not None and self._thread.is_alive():
            logger.warning("Vosk processor thread already running.")
            return
        if self._recognizer is None:
             logger.error("Cannot start processor: Vosk Recognizer not initialized (check model path).")
             return

        logger.info("Starting Vosk processor thread...")
        self.stop_event.clear()
        self._thread = threading.Thread(target=self._processing_loop, daemon=True, name="VoskProcessorThread")
        self._thread.start()

    def stop(self):
        """Signals the background processing thread to stop and waits for it."""
        if self._thread is None or not self._thread.is_alive():
            logger.info("Vosk processor thread not running.")
            return

        logger.info("Stopping Vosk processor thread...")
        self.stop_event.set()

        # Put None into the audio queue to unblock the .get() call in the thread
        # Needs to be done from the loop the queue belongs to
        if self.loop.is_running():
             asyncio.run_coroutine_threadsafe(self.audio_input_queue.put(None), self.loop)
        else:
             logger.warning("Asyncio loop not running, cannot signal Vosk processor queue.")

        self._thread.join(timeout=5.0)
        if self._thread.is_alive():
            logger.warning("Vosk processor thread did not stop cleanly after 5 seconds.")
        else:
            logger.info("Vosk processor thread joined successfully.")
        self._thread = None

    def is_active(self) -> bool:
        """Returns True if the processor is running."""
        return self._thread is not None and self._thread.is_alive()

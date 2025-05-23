import asyncio
import logging
import threading
import time
import traceback

from src.handlers.audio.audio_source_handler import AudioSourceHandler
from src.handlers.real_time_asr_interface import RealTimeASRProcessor

# Configure logging
logger = logging.getLogger(__name__)


class AudioStreamer:
    """Manages audio streaming to a RealTimeASRProcessor."""

    def __init__(
        self,
        audio_handler: AudioSourceHandler,
        asr_processor_cls: type[RealTimeASRProcessor],  # Pass the class
        asr_config: dict,  # Config specific to the ASR processor
        vad_config: dict,
        loop: asyncio.AbstractEventLoop,
    ):
        self.audio_handler = audio_handler
        self.loop = loop
        self.vad_config = vad_config
        self._is_streaming = False
        self._stop_event = threading.Event()
        self._audio_capture_thread: threading.Thread | None = None
        self._lock = threading.Lock()

        logger.info("AudioStreamer: Initializing...")

        # Create queues that will persist for the lifetime of AudioStreamer
        # These are passed to the ASR processor upon its creation.
        init_q_create_start_time = time.monotonic()
        try:
            future_audio_q = asyncio.run_coroutine_threadsafe(
                self._create_queue_async(500), self.loop
            )
            future_transcript_q = asyncio.run_coroutine_threadsafe(
                self._create_queue_async(100), self.loop
            )
            # Timeout for init is less critical but good to have.
            self._audio_queue: asyncio.Queue | None = future_audio_q.result(timeout=5.0)
            self.transcript_queue: asyncio.Queue | None = future_transcript_q.result(
                timeout=5.0
            )
            init_q_create_duration = (
                time.monotonic() - init_q_create_start_time
            ) * 1000
            logger.info(
                f"AudioStreamer: Persistent queues created in {init_q_create_duration:.2f} ms."
            )
        except Exception as e:
            logger.error(
                f"AudioStreamer: Failed to create persistent asyncio queues during init: {e}",
                exc_info=True,
            )
            # This is a fatal error for the streamer.
            raise

        # Pre-initialize ASR processor to move model loading/setup time here
        init_asr_setup_start_time = time.monotonic()
        try:
            logger.info("AudioStreamer: Pre-initializing ASR processor instance...")
            self._asr_processor_instance: RealTimeASRProcessor | None = (
                asr_processor_cls(
                    audio_input_queue=self._audio_queue,
                    sample_rate=self.audio_handler.sample_rate,
                    transcript_output_queue=self.transcript_queue,
                    loop=self.loop,
                    **asr_config,
                )
            )
            init_asr_setup_duration = (
                time.monotonic() - init_asr_setup_start_time
            ) * 1000
            logger.info(
                f"AudioStreamer: ASR processor INSTANCE created in {init_asr_setup_duration:.2f} ms (model loaded)."
            )
            # Note: We do not call _asr_processor_instance.start() here.
            # That will be done in start_streaming().
        except Exception as e:
            logger.error(
                f"AudioStreamer: Error during ASR processor instantiation in __init__: {e}",
                exc_info=True,
            )
            self._asr_processor_instance = None  # Ensure it's None if init failed
            # This error would prevent streaming later
            raise

        logger.info("AudioStreamer: Initialized successfully.")

    @property
    def is_streaming(self) -> bool:
        with self._lock:
            return self._is_streaming

    async def _create_queue_async(self, size: int) -> asyncio.Queue:
        """Coroutine helper to create queue in the target loop"""
        return asyncio.Queue(maxsize=size)

    def start_streaming(self) -> bool:
        """Starts audio capture and the ASR processor."""
        timestamp = time.strftime("%H:%M:%S")
        with self._lock:
            if self._is_streaming:
                logger.info(f"[{timestamp}] AudioStreamer: Already streaming.")
                return False
            if not self.loop or not self.loop.is_running():
                logger.error(
                    f"[{timestamp}] AudioStreamer: ERROR - Asyncio loop not running."
                )
                return False

            if not self._asr_processor_instance:
                logger.error(
                    f"[{timestamp}] AudioStreamer: ERROR - ASR processor instance not available. Cannot start."
                )
                return False

            # Ensure queues are available (should have been created in __init__)
            if not self._audio_queue or not self.transcript_queue:
                logger.error(
                    f"[{timestamp}] AudioStreamer: ERROR - Audio/Transcript queues not available. Cannot start."
                )
                return False

            self._is_streaming = True
            self._stop_event.clear()

            logger.info(f"[{timestamp}] AudioStreamer: Starting stream operations...")

            # Clear any stale data from the persistent audio queue before starting new session
            # This prevents the new ASR processing thread from immediately exiting due to a leftover None sentinel.
            if self._audio_queue:
                logger.info(
                    f"[{timestamp}] AudioStreamer: Clearing persistent audio queue... (current size: {self._audio_queue.qsize()})"
                )
                while not self._audio_queue.empty():
                    try:
                        # We must use get_nowait() as this code is synchronous.
                        # The queue is used by asyncio tasks, but clearing it here is fine if done carefully.
                        self._audio_queue.get_nowait()
                        # If AudioStreamer's queues were to use task_done(), we'd call it here.
                        # However, typical usage pattern for producer/consumer with asyncio.Queue
                        # doesn't always require task_done() unless join() is used on the queue.
                    except asyncio.QueueEmpty:
                        break  # Queue is empty
                    except Exception as e_clear:
                        # Log error and break to avoid an infinite loop if unexpected issue.
                        logger.error(
                            f"[{timestamp}] AudioStreamer: Error while clearing audio_queue: {e_clear}"
                        )
                        break
                logger.info(
                    f"[{timestamp}] AudioStreamer: Persistent audio queue cleared. (new size: {self._audio_queue.qsize()})"
                )

            # ASR processor is already instantiated. Ensure its processing thread is started.
            asr_start_call_time = time.monotonic()
            try:
                # VoskProcessor.start() is idempotent and checks if already running.
                logger.info(
                    f"[{timestamp}] AudioStreamer: Calling start() on ASR processor instance..."
                )
                self._asr_processor_instance.start()  # This starts/ensures VoskProcessor's internal thread is running
                asr_start_call_duration = (
                    time.monotonic() - asr_start_call_time
                ) * 1000
                logger.info(
                    f"[{timestamp}] AudioStreamer: ASR processor start() call completed in {asr_start_call_duration:.2f} ms."
                )
            except Exception as e:
                logger.error(
                    f"[{timestamp}] AudioStreamer: Failed to start ASR processor: {e}"
                )
                traceback.print_exc()
                self._is_streaming = False  # Revert state
                return False

            # Start audio capture thread - THIS IS CRITICAL PATH FOR AUDIO INPUT START
            capture_thread_start_time = time.monotonic()
            self._audio_capture_thread = threading.Thread(
                target=self.audio_handler.stream_audio_to_async_queue,
                args=(
                    self._stop_event,
                    self._audio_queue,
                    self.loop,
                    self.vad_config,
                    "bytes",
                ),
                daemon=True,
                name="AudioCaptureThread",
            )
            self._audio_capture_thread.start()
            capture_thread_setup_duration = (
                time.monotonic() - capture_thread_start_time
            ) * 1000
            logger.info(
                f"[{timestamp}] AudioStreamer: Audio capture thread started ({capture_thread_setup_duration:.2f} ms setup for thread.start()). Stream opening time is internal to handler."
            )
            return True

    def stop_streaming(self) -> None:
        """Stops audio capture and the ASR processor's current session."""
        timestamp = time.strftime("%H:%M:%S")

        with self._lock:
            if not self._is_streaming:
                # logger.debug(f"[{timestamp}] AudioStreamer: Not streaming, nothing to stop.")
                return

            logger.info(f"[{timestamp}] AudioStreamer: Stopping stream operations...")
            self._is_streaming = (
                False  # Set state early to prevent new starts overlapping
            )

            # Signal audio capture thread to stop producing data
            self._stop_event.set()

        # Join capture thread first to ensure it stops feeding the ASR processor
        capture_thread_to_join = (
            self._audio_capture_thread
        )  # Get reference before nullifying under lock
        if capture_thread_to_join and capture_thread_to_join.is_alive():
            logger.info(
                f"[{timestamp}] AudioStreamer: Waiting for capture thread to join..."
            )
            capture_thread_to_join.join(timeout=1.5)
            if capture_thread_to_join.is_alive():
                logger.warning(
                    f"[{timestamp}] AudioStreamer: Capture thread did not join cleanly."
                )
        self._audio_capture_thread = None  # Clear thread reference

        # Now, stop the ASR processor's current recognition cycle.
        # The ASR processor instance itself and its queues are persistent.
        asr_processor_to_stop = self._asr_processor_instance
        if asr_processor_to_stop and asr_processor_to_stop.is_active():
            try:
                logger.info(
                    f"[{timestamp}] AudioStreamer: Calling stop() on ASR processor instance..."
                )
                # VoskProcessor.stop() handles its internal thread and sends None to its input queue.
                asr_processor_to_stop.stop()
                logger.info(
                    f"[{timestamp}] AudioStreamer: ASR processor stop() call completed."
                )
            except Exception as e:
                logger.error(
                    f"[{timestamp}] AudioStreamer: Error calling stop() on ASR processor: {e}"
                )

        # Do NOT nullify _asr_processor_instance, _audio_queue, or self.transcript_queue here.
        # They are reused.
        # If queues need clearing of residual data, that should be handled carefully,
        # or ensured that ASR processor handles new stream starts cleanly.
        # Vosk KaldiRecognizer is reset when .Result() or .FinalResult() is called after silence or end of data.

        logger.info(f"[{timestamp}] AudioStreamer: Stream operations stopped.")

    def cleanup(self) -> None:
        """Ensures all streaming components are fully stopped and cleaned up."""
        logger.info("AudioStreamer: Cleaning up...")

        # Ensure any active streaming session is stopped first.
        if self._is_streaming:
            logger.info(
                "AudioStreamer: Active stream detected during cleanup, stopping it first."
            )
            self.stop_streaming()  # This handles threads and ASR processor's current session.

        # Now, perform final cleanup of the persistent ASR processor and queues.
        asr_processor_to_clean = self._asr_processor_instance
        if asr_processor_to_clean:
            # If ASR processor is active (e.g., its thread didn't stop cleanly via stop_streaming),
            # try to stop it again more forcefully or log.
            if asr_processor_to_clean.is_active():
                logger.warning(
                    "AudioStreamer: ASR processor still active during cleanup. Attempting stop again."
                )
                try:
                    asr_processor_to_clean.stop()
                except Exception as e:
                    logger.error(
                        f"AudioStreamer: Error during ASR processor stop in cleanup: {e}"
                    )

            # Check for a specific cleanup method on the ASR processor if implemented
            cleanup_fn = getattr(asr_processor_to_clean, "cleanup", None)
            if callable(cleanup_fn):
                try:
                    logger.info(
                        "AudioStreamer: Calling cleanup() on ASR processor instance..."
                    )
                    # asr_processor_to_clean.cleanup() # If such a method exists
                except Exception as e:
                    logger.error(
                        f"AudioStreamer: Error cleaning up ASR processor instance: {e}"
                    )

        self._asr_processor_instance = None  # Release reference

        # Queues can now be cleared as they won't be reused after cleanup.
        # Sending None to queues might be needed if consumers are still somehow pending.
        # However, stop_streaming should have handled graceful shutdown of consumers.
        if self._audio_queue and self.loop.is_running():
            # Example of how one might try to signal end to any listener on audio_queue if needed,
            # though VoskProcessor.stop() already does this for its consumption of _audio_queue.
            # asyncio.run_coroutine_threadsafe(self._audio_queue.put(None), self.loop)
            pass
        self._audio_queue = None

        if self.transcript_queue and self.loop.is_running():
            # asyncio.run_coroutine_threadsafe(self.transcript_queue.put(None), self.loop)
            pass
        self.transcript_queue = None

        logger.info("AudioStreamer: Cleanup finished.")

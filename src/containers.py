# src/containers.py
import asyncio
import os
import queue
import sys  # Added for get_resource_path
import threading
from typing import Any  # Added for helper function type hint

from dependency_injector import containers, providers

from src.app_config import AppConfig
from src.application_interface import ApplicationInterface
from src.apps.browser import BrowserApp
from src.apps.macos import MacOSapp
from src.apps.notes import NotesApp
from src.apps.text_edit import TextEditApp
from src.clients.openai_client import OpenAIWebRTCClient
from src.command_processor import CommandProcessor
from src.context_manager import ContextManager
from src.discrete_application_runner import DiscreteApplicationRunner
from src.engines.context_engine import ContextEngine
from src.engines.intent_engine import IntentEngine
from src.engines.macos_engine import MacOSEngine
from src.engines.processing_engine import ProcessingEngine
from src.handlers.asr_handler_interface import ASRHandlerInterface
from src.handlers.audio.audio_recorder import AudioRecorder
from src.handlers.audio.audio_source_handler import AudioSourceHandler
from src.handlers.audio.audio_streamer import AudioStreamer
from src.handlers.faster_whisper_asr_handler import FasterWhisperASRHandler
from src.handlers.llm_handler import LLMHandler
from src.handlers.openai_asr_handler import OpenAIASRHandler
from src.handlers.vosk_processor import VoskProcessor
from src.streaming_application_runner import StreamingApplicationRunner

# --- Asyncio Loop Provider ---
# Manage the asyncio loop lifecycle here, started/stopped by the container/app manager
class AsyncioLoopManager:
    def __init__(self):
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._stop_event = threading.Event()

    def get_loop(self) -> asyncio.AbstractEventLoop:
        with self._lock:
            if self._loop is None or not self._loop.is_running():
                print("AsyncioLoopManager: Starting loop...")
                self._stop_event.clear()
                start_event = threading.Event()
                self._thread = threading.Thread(target=self._run_loop, args=(start_event,), daemon=True)
                self._thread.start()
                if not start_event.wait(timeout=3.0):
                    raise RuntimeError("Asyncio loop failed to start")
                print("AsyncioLoopManager: Loop started.")
            if self._loop is None: # Check again after wait
                 raise RuntimeError("Asyncio loop is None after start attempt")
            return self._loop

    def _run_loop(self, start_event: threading.Event):
        try:
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
            start_event.set() # Signal loop object is ready
            # Run until explicitly stopped
            while not self._stop_event.is_set():
                 self._loop.run_until_complete(asyncio.sleep(0.1)) # Keep running
            # Perform final cleanup if needed before closing
            print("AsyncioLoopManager: Running final loop tasks before close...")
            self._loop.run_until_complete(self._loop.shutdown_asyncgens())
            print("AsyncioLoopManager: Closing loop...")
            self._loop.close()
        except Exception as e:
            print(f"AsyncioLoopManager: Error in loop thread: {e}")
        finally:
             print("AsyncioLoopManager: Loop thread finished.")
             with self._lock: # Ensure setting loop to None is safe
                self._loop = None


    def stop_loop(self):
        thread_to_join = None # Initialize here
        with self._lock:
            if self._thread and self._thread.is_alive():
                print("AsyncioLoopManager: Stopping loop...")
                self._stop_event.set() # Signal run_until_complete loop to exit
                if self._loop and self._loop.is_running():
                     # Request stop for run_forever if it was used instead
                     self._loop.call_soon_threadsafe(self._loop.stop)

                thread_to_join = self._thread # Copy handle

        # Join outside lock
        if thread_to_join:
            thread_to_join.join(timeout=3.0)
            if thread_to_join.is_alive():
                 print("Warning: Asyncio loop thread did not stop cleanly.")
        print("AsyncioLoopManager: Loop stop sequence finished.")

# Helper function for Selector
def _is_streaming_mode(config_value: Any) -> str:
    """Checks if the config value represents streaming mode. Returns 'true' or 'false'."""
    print(f"DEBUG: _is_streaming_mode received: {repr(config_value)} (type: {type(config_value)})") # DEBUG
    bool_result = False # Default
    if isinstance(config_value, bool):
        bool_result = config_value
    elif isinstance(config_value, str):
        bool_result = config_value.lower() in ('true', '1', 't', 'y', 'yes', 'on')
    elif isinstance(config_value, int):
        bool_result = config_value == 1
    else:
        # Handle unexpected types if necessary, maybe log a warning
        print(f"DEBUG: _is_streaming_mode received unexpected type: {type(config_value)}")
        bool_result = False

    str_result = str(bool_result).lower() # Convert boolean to lowercase string 'true' or 'false'
    print(f"DEBUG: _is_streaming_mode returning: {repr(str_result)}") # DEBUG
    return str_result

class Container(containers.DeclarativeContainer):
    config = providers.Configuration()

    # --- Shared UI Queue ---
    # Provide a single queue instance for status updates
    status_queue = providers.Singleton(queue.Queue)

    # --- Asyncio Loop Manager (Singleton) ---
    asyncio_loop_manager = providers.Singleton(AsyncioLoopManager)
    # Provide the loop instance itself via the manager
    asyncio_loop = providers.Callable(lambda m: m.get_loop(), asyncio_loop_manager)

    # --- Core Handlers/Services ---

    llm_handler = providers.Singleton(
        LLMHandler,
        llm_source=config.LLM.source,
        llm_model=providers.Callable(
            lambda source, model, ollama_model: (
                ollama_model if source == "ollama"
                else model
            ),
            config.LLM.source,
            config.OpenAI.model,
            config.Ollama.model,
        ),
        openai_api_key=config.OpenAI.api_key
    )

    audio_source_handler = providers.Singleton(
        AudioSourceHandler,
        # Inject required typed values
        sample_rate=config.Audio.sample_rate.as_int(),
        channels=config.Audio.channels.as_int(),
        # Inject base provider for optional int - handled in __init__
        device_index=config.Audio.device_index
    )

    # --- Clients --- Added section for clients
    openai_webrtc_client = providers.Singleton(
        OpenAIWebRTCClient,
        api_key=config.OpenAI.api_key
        # The session_url uses the default value in the client's __init__
    )

    intent_engine = providers.Singleton(
        IntentEngine,
        llm_handler=llm_handler
    )

    macos_engine = providers.Singleton(
        MacOSEngine
    )

    # --- App-Specific Logic ---
    browser_app = providers.Singleton(
        BrowserApp,
        llm_handler=llm_handler
    )

    text_edit_app = providers.Singleton(
        TextEditApp,
        llm_handler=llm_handler
    )

    notes_app = providers.Singleton(
        NotesApp,
        llm_handler=llm_handler,
        intent_engine=intent_engine
    )

    macos_app = providers.Singleton(
        MacOSapp,
        llm_handler=llm_handler,
        macos_engine=macos_engine
    )

    context_engine = providers.Singleton(
        ContextEngine,
        text_edit_app=text_edit_app,
        browser_app=browser_app,
        notes_app=notes_app,
        macos_app=macos_app,
    )

    processing_engine = providers.Singleton(
        ProcessingEngine,
        config=config,
        # Inject apps directly
        text_edit_app=text_edit_app,
        browser_app=browser_app,
        notes_app=notes_app,
        macos_app=macos_app,
    )

    context_manager = providers.Singleton(
        ContextManager,
        context_engine=context_engine
    )

    command_processor = providers.Singleton(
        CommandProcessor,
        processing_engine=processing_engine,
        status_queue=status_queue
    )

    # --- Discrete Mode Components ---
    discrete_asr_handler: providers.Provider[ASRHandlerInterface] = providers.Selector(
        config.ASR.source,
        openai_api=providers.Singleton(
            OpenAIASRHandler,
            # Copied from main asr_handler
            api_key=config.OpenAI.api_key,
            model=config.ASR.model,
        ),
        faster_whisper=providers.Singleton(
            FasterWhisperASRHandler,
            # Copied from main asr_handler
            local_model_size=config.ASR.local_model_size,
            device=config.ASR.device,
            compute_type=config.ASR.compute_type,
        ),
    )


    app_config = providers.Singleton(
        AppConfig,
        config_dict=config
    )

    # VAD Config provider - using Callable instead of Dict
    vad_config_provider = providers.Dict(
        enabled=providers.AttributeGetter(app_config, "vad_enabled"),
        aggressiveness=providers.AttributeGetter(app_config, "vad_aggressiveness"),
        silence_duration_ms=providers.AttributeGetter(app_config, "silence_duration_ms"),
        frame_duration_ms=providers.AttributeGetter(app_config, "frame_duration_ms")
    )

    audio_recorder = providers.Singleton(
        AudioRecorder,
        audio_handler=audio_source_handler,
        vad_config=vad_config_provider,
        status_queue=status_queue
    )

    # --- Streaming Mode Components ---
    # Real-time ASR Processor selector (if multiple options later)
    # For now, just Vosk
    vosk_config_provider = providers.Dict(
        model_path=config.Vosk.model_path,
    )

    # Provide the VoskProcessor class itself for AudioStreamer
    # The streamer will instantiate it
    realtime_asr_processor_cls = providers.Object(VoskProcessor)

    audio_streamer = providers.Singleton(
        AudioStreamer,
        audio_handler=audio_source_handler,
        asr_processor_cls=realtime_asr_processor_cls,
        asr_config=vosk_config_provider,
        loop=asyncio_loop # Inject the loop from the manager
    )

    discrete_runner = providers.Factory( # Factory ensures new instance if container reset
        DiscreteApplicationRunner,
        config=app_config,
        context_manager=context_manager,
        command_processor=command_processor,
        audio_recorder=audio_recorder,
        asr_handler=discrete_asr_handler,
        status_queue=status_queue,
    )

    streaming_runner = providers.Factory(
        StreamingApplicationRunner,
        config=app_config,
        context_manager=context_manager,
        command_processor=command_processor,
        audio_streamer=audio_streamer,
        status_queue=status_queue,
    )

    # --- Main Application Selector ---
    application: providers.Provider[ApplicationInterface] = providers.Selector(
        providers.Callable(_is_streaming_mode, config.Mode.streaming), # Use the helper returning 'true'/'false'
        true=streaming_runner,
        false=discrete_runner,
    )

# Optional: Function to get the absolute path, similar to your main.py
# Ensure sys is imported if using this
def get_resource_path(relative_path):
    try:
        base_path = sys._MEIPASS # type: ignore
    except Exception:
        # Corrected path finding relative to containers.py
        base_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    return os.path.join(base_path, relative_path)
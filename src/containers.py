import os
import queue
import sys
from typing import Any

from dependency_injector import containers, providers

from src.app_config import AppConfig
from src.application_interface import ApplicationInterface
from src.apps.browser import BrowserApp
from src.apps.macos import MacOSapp
from src.apps.notes import NotesApp
from src.apps.text_edit import TextEditApp
from src.asyncio_loop_manager import AsyncioLoopManager
from src.clients.gemini_client import GeminiClient
from src.clients.groq_client import GroqClient
from src.clients.llm_client_interface import LLMClientInterface
from src.clients.ollama_client import OllamaClient
from src.clients.openai_client import OpenAIClient
from src.clients.openai_webrtc_client import OpenAIWebRTCClient
from src.command_processor import CommandProcessor
from src.context_manager import ContextManager
from src.discrete_application_runner import DiscreteApplicationRunner
from src.engines.context_engine import ContextEngine
from src.engines.intent_engine import IntentEngine
from src.engines.macos_engine import MacOSEngine
from src.engines.processing_engine import ProcessingEngine
from src.handlers.audio.asr_handler_interface import ASRHandlerInterface
from src.handlers.audio.audio_recorder import AudioRecorder
from src.handlers.audio.audio_source_handler import AudioSourceHandler
from src.handlers.audio.audio_streamer import AudioStreamer
from src.handlers.audio.faster_whisper_asr_handler import FasterWhisperASRHandler
from src.handlers.audio.gemini_asr_handler import GeminiASRHandler
from src.handlers.audio.groq_asr_handler import GroqASRHandler
from src.handlers.llm_handler import LLMHandler
from src.handlers.audio.openai_asr_handler import OpenAIASRHandler
from src.handlers.vosk_processor import VoskProcessor
from src.one_shot_application_runner import OneShotApplicationRunner
from src.streaming_application_runner import StreamingApplicationRunner

class Container(containers.DeclarativeContainer):
    config = providers.Configuration()

    # --- Shared UI Queue ---
    # Provide a single queue instance for status updates
    status_queue = providers.Singleton(queue.Queue)

    # --- Asyncio Loop Manager (Singleton) ---
    asyncio_loop_manager = providers.Singleton(AsyncioLoopManager)
    # Provide the loop instance itself via the manager
    asyncio_loop = providers.Callable(lambda m: m.get_loop(), asyncio_loop_manager)

    # --- LLM Clients ---
    openai_llm_client_provider = providers.Singleton(
        OpenAIClient,
        api_key=config.APIKeys.openai_api_key,
        user_command_model=config.OpenAI.user_command_model,
        asr_model=config.OpenAI.asr_model,
    )

    groq_llm_client_provider = providers.Singleton(
        GroqClient,
        api_key=config.APIKeys.groq_api_key,
        user_command_model=config.Groq.user_command_model,
        asr_model=config.Groq.asr_model,
    )

    ollama_llm_client_provider = providers.Singleton(
        OllamaClient,
        model=config.Ollama.model,
        base_url=config.Ollama.base_url.as_str(),
    )

    gemini_llm_client_provider = providers.Singleton(
        GeminiClient,
        user_command_model=config.Gemini.user_command_model,
        asr_model=config.Gemini.asr_model,
        api_key=config.APIKeys.gemini_api_key,
    )

    # Selector for the LLM client instance based on config.LLM.source
    # The keys ('openai_api', 'ollama') must match the possible values of config.LLM.source
    selected_llm_client: providers.Provider[LLMClientInterface] = providers.Selector(
        config.LLM.source,
        openai_api=openai_llm_client_provider,
        ollama=ollama_llm_client_provider,
        gemini_api=gemini_llm_client_provider,
        groq_api=groq_llm_client_provider,
    )

    # --- Core Handlers/Services ---

    llm_handler = providers.Singleton(LLMHandler, client=selected_llm_client)

    audio_source_handler = providers.Singleton(
        AudioSourceHandler,
        # Inject required typed values
        sample_rate=config.Audio.sample_rate.as_int(),
        channels=config.Audio.channels.as_int(),
        # Inject base provider for optional int - handled in __init__
        device_index=config.Audio.device_index,
    )

    # --- Clients --- Added section for clients
    openai_webrtc_client = providers.Singleton(
        OpenAIWebRTCClient,
        api_key=config.APIKeys.openai_api_key,
        # The session_url uses the default value in the client's __init__
    )

    intent_engine = providers.Singleton(IntentEngine, llm_handler=llm_handler)

    macos_engine = providers.Singleton(MacOSEngine)

    # --- App-Specific Logic ---
    browser_app = providers.Singleton(BrowserApp, llm_handler=llm_handler)

    text_edit_app = providers.Singleton(TextEditApp, llm_handler=llm_handler)

    notes_app = providers.Singleton(
        NotesApp, llm_handler=llm_handler, intent_engine=intent_engine
    )

    macos_app = providers.Singleton(
        MacOSapp, llm_handler=llm_handler, macos_engine=macos_engine
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

    context_manager = providers.Singleton(ContextManager, context_engine=context_engine)

    command_processor = providers.Singleton(
        CommandProcessor, processing_engine=processing_engine, status_queue=status_queue
    )

    # --- Discrete Mode Components ---
    discrete_asr_handler: providers.Provider[ASRHandlerInterface] = providers.Selector(
        config.ASR.source,
        openai_api=providers.Singleton(
            OpenAIASRHandler, openAIClient=openai_llm_client_provider
        ),
        groq_api=providers.Singleton(
            GroqASRHandler, groqClient=groq_llm_client_provider
        ),
        faster_whisper=providers.Singleton(
            FasterWhisperASRHandler,
            local_model_size=config.ASR.local_model_size,
            device=config.ASR.device,
            compute_type=config.ASR.compute_type,
        ),
        gemini_api=providers.Singleton(
            GeminiASRHandler, gemini_client=gemini_llm_client_provider
        ),
    )

    app_config = providers.Factory(AppConfig, config_dict=config)

    # VAD Config provider - using Callable instead of Dict
    vad_config_provider = providers.Dict(
        enabled=providers.AttributeGetter(app_config, "vad_enabled"),
        aggressiveness=providers.AttributeGetter(app_config, "vad_aggressiveness"),
        silence_duration_ms=providers.AttributeGetter(
            app_config, "silence_duration_ms"
        ),
        frame_duration_ms=providers.AttributeGetter(app_config, "frame_duration_ms"),
    )

    audio_recorder = providers.Singleton(
        AudioRecorder,
        audio_handler=audio_source_handler,
        vad_config=vad_config_provider,
        status_queue=status_queue,
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
        loop=asyncio_loop,  # Inject the loop from the manager
    )

    discrete_runner = (
        providers.Factory(  # Factory ensures new instance if container reset
            DiscreteApplicationRunner,
            config=app_config,
            context_manager=context_manager,
            command_processor=command_processor,
            audio_recorder=audio_recorder,
            asr_handler=discrete_asr_handler,
            status_queue=status_queue,
        )
    )

    streaming_runner = providers.Factory(
        StreamingApplicationRunner,
        config=app_config,
        context_manager=context_manager,
        command_processor=command_processor,
        audio_streamer=audio_streamer,
        status_queue=status_queue,
    )

    one_shot_runner = providers.Factory(
        OneShotApplicationRunner,
        config=app_config,
        context_manager=context_manager,
        command_processor=command_processor,
        audio_recorder=audio_recorder,
        status_queue=status_queue,
    )

    # --- Main Application Selector ---
    application: providers.Provider[ApplicationInterface] = providers.Selector(
        config.Mode.application_mode,  # Use the helper returning 'true'/'false'
        streaming=streaming_runner,
        discrete=discrete_runner,
        oneshot=one_shot_runner,
    )

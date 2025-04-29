# src/containers.py
from dependency_injector import containers, providers
import configparser
import os
import sys # Added for get_resource_path

from src.discrete_audio_application import DiscreteAudioApplication
from src.application_interface import ApplicationInterface
from src.apps.browser import BrowserApp
from src.apps.macos import MacOSapp
from src.apps.notes import NotesApp
from src.apps.text_edit import TextEditApp
from src.engines.intent_engine import IntentEngine
from src.handlers.asr_handler_interface import ASRHandlerInterface
from src.handlers.openai_asr_handler import OpenAIASRHandler
from src.handlers.faster_whisper_asr_handler import FasterWhisperASRHandler
from src.handlers.audio_handler import AudioHandler
from src.engines.context_engine import ContextEngine
from src.engines.processing_engine import ProcessingEngine
from src.handlers.llm_handler import LLMHandler


class Container(containers.DeclarativeContainer):
    config = providers.Configuration()

    # --- Platform Utils (Example Injection) ---
    # platform_utilities = providers.Object(platform_utils)

    # --- Core Handlers/Services ---

    llm_handler = providers.Singleton(
        LLMHandler,
        llm_source=config.LLM.source,
        llm_model=config.LLM.model,
        openai_api_key=config.OpenAI.api_key,
        # Inject base provider for optional int - handled in __init__
        local_quantization=config.LLM.quantization
    )

    # --- ASR Handler Selection ---
    # Use Selector to choose the ASR implementation based on config
    asr_handler: providers.Provider[ASRHandlerInterface] = providers.Selector(
        config.ASR.source, # The configuration value to select on

        # Option 1: 'openai_api'
        openai_api=providers.Singleton( # Use Singleton if you want only one instance
            OpenAIASRHandler,
            # Pass only the required dependencies for OpenAIASRHandler
            api_key=config.OpenAI.api_key,
            model=config.ASR.model, # Assumes config.ASR.model holds the OpenAI model name
        ),

        # Option 2: 'faster_whisper'
        faster_whisper=providers.Singleton( # Use Singleton if you want only one instance
            FasterWhisperASRHandler,
            # Pass only the required dependencies for FasterWhisperASRHandler
            local_model_size=config.ASR.local_model_size,
            device=config.ASR.device,
            compute_type=config.ASR.compute_type,
            # Note: We are not passing config.ASR.model here, assuming it's not needed
            # or FasterWhisperASRHandler derives it from local_model_size if necessary.
        )
        # Add more handlers here keyed by their config.ASR.source value
        # e.g., some_other_asr_provider=providers.Singleton(SomeOtherASRHandler, ...)
    )

    audio_handler = providers.Singleton(
        AudioHandler,
        # Inject required typed values
        sample_rate=config.Audio.sample_rate.as_int(),
        channels=config.Audio.channels.as_int(),
        # Inject base provider for optional int - handled in __init__
        device_index=config.Audio.device_index
    )

    intent_engine = providers.Singleton(
        IntentEngine,
        llm_handler=llm_handler
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
        llm_handler=llm_handler
    )

    shared_apps = {
        'text_edit_app': text_edit_app,
        'browser_app': browser_app,
        'notes_app': notes_app,
        'macos_app': macos_app
    }

    context_engine = providers.Singleton(
        ContextEngine,
        **shared_apps
    )

    processing_engine = providers.Singleton(
        ProcessingEngine,
        config=config,
        **shared_apps,
    )

    
    # --- Main Application ---
    application: providers.Provider[ApplicationInterface] = providers.Singleton(
        DiscreteAudioApplication,
        context_engine=context_engine,
        processing_engine=processing_engine,
        asr_handler=asr_handler,
        llm_handler=llm_handler,
        audio_handler=audio_handler,
        raw_config=config,
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
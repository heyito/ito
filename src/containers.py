# src/containers.py
from dependency_injector import containers, providers
import configparser
import os
import sys # Added for get_resource_path

from src.application import Application
# Removed unused TextEditApp/GoogleChromeApp imports for now
# from src.apps.text_edit import TextEditApp
# from src.apps.google_chrome import GoogleChromeApp
from src.apps.google_chrome import GoogleChromeApp
from src.apps.notes import NotesApp
from src.apps.text_edit import TextEditApp
from src.engines.intent_engine import IntentEngine
from src.handlers.asr_handler import ASRHandler
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

    asr_handler = providers.Singleton(
        ASRHandler,
        # Inject required values
        source=config.ASR.source,
        api_key=config.OpenAI.api_key,
        model=config.ASR.model,
        # Inject base providers for optional strings - handled in __init__
        local_model_size=config.ASR.local_model_size,
        device=config.ASR.device,
        compute_type=config.ASR.compute_type
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
    google_chrome_app = providers.Singleton(
        GoogleChromeApp,
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

    shared_apps = {
        'text_edit_app': text_edit_app,
        'google_chrome_app': google_chrome_app,
        'notes_app': notes_app
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
    application = providers.Singleton(
        Application,
        context_engine=context_engine,
        processing_engine=processing_engine,
        asr_handler=asr_handler,
        llm_handler=llm_handler,
        audio_handler=audio_handler,
        config=config,
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
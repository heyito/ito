from typing import Any


class AppConfig:
    """
    Handles application configuration loading and access.
    """

    def __init__(self, config_dict: dict[str, Any]):
        """
        Initializes the AppConfig by parsing the configuration dictionary.

        Args:
            config_dict: The raw configuration dictionary loaded from a file or source.
        """
        # OpenAI settings
        openai_section = config_dict.get("OpenAI", {})
        self.openai_api_key: str = openai_section.get("api_key", "")
        self.openai_user_command_model: str = openai_section.get(
            "user_command_model", "gpt-4.1"
        )
        self.openai_asr_model: str = openai_section.get("asr_model", "whisper-1")

        # Gemini Settings
        gemini_section = config_dict.get("Gemini", {})
        self.gemini_api_key: str = gemini_section.get("api_key", "")
        self.gemini_user_command_model: str = gemini_section.get(
            "user_command_model", "gemini-2.0-flash"
        )
        self.gemini_asr_model: str = gemini_section.get("asr_model", "gemini-2.0-flash")

        # Groq settings
        groq_section = config_dict.get("Groq", {})
        self.groq_api_key: str = groq_section.get("api_key", "")
        self.groq_user_command_model: str = groq_section.get(
            "user_command_model", "llama3-8b-8192"
        )
        self.groq_asr_model: str = groq_section.get("asr_model", "whisper-large-v3")

        # Ollama settings
        ollama_section = config_dict.get("Ollama", {})
        self.ollama_model: str = ollama_section.get("model", "llama3.2:latest")

        # ASR settings
        asr_section: dict[str, Any] = config_dict.get("ASR", {})
        self.asr_source: str = asr_section.get("source", "openai_api")
        self.asr_local_model_size: str = asr_section.get("local_model_size", "base.en")
        self.asr_device: str = asr_section.get("device", "auto")
        self.asr_compute_type: str = asr_section.get("compute_type", "default")

        # Specific ASR models from their respective sections used as fallbacks or for client init
        self.openai_asr_model_config: str = config_dict.get("OpenAI", {}).get(
            "asr_model", "whisper-1"
        )
        self.gemini_asr_model_config: str = config_dict.get("Gemini", {}).get(
            "asr_model", "gemini-2.0-flash"
        )
        self.groq_asr_model_config: str = config_dict.get("Groq", {}).get(
            "asr_model", "distil-whisper-large-v3-en"
        )

        # Generic asr_model based on source, prioritizing ASR/model from config_dict
        if self.asr_source == "openai_api":
            self.asr_model: str = asr_section.get("model", self.openai_asr_model_config)
        elif self.asr_source == "gemini_api":
            self.asr_model: str = asr_section.get("model", self.gemini_asr_model_config)
        elif self.asr_source == "groq_api":
            self.asr_model: str = asr_section.get("model", self.groq_asr_model_config)
        elif self.asr_source == "faster_whisper":
            self.asr_model: str = (
                self.asr_local_model_size
            )  # For faster_whisper, this is the effective model identifier
        else:  # Default if source is unknown or not handled above
            self.asr_model: str = asr_section.get(
                "model", "whisper-1"
            )  # Default to a generic whisper model

        # LLM settings
        llm_section = config_dict.get("LLM", {})
        self.llm_source: str = llm_section.get("source", "openai_api")
        if self.llm_source == "ollama":
            self.llm_model: str = self.ollama_model
        elif self.llm_source == "openai_api":
            self.llm_model: str = self.openai_user_command_model
        elif self.llm_source == "gemini_api":
            self.llm_model: str = self.gemini_user_command_model
        elif self.llm_source == "groq_api":
            self.llm_model: str = self.groq_user_command_model
        else:
            self.llm_model: str = self.openai_user_command_model
        self.max_tokens: int = int(llm_section.get("max_tokens", 2000))
        self.temperature: float = float(llm_section.get("temperature", 0.7))

        # Audio settings
        audio_section = config_dict.get("Audio", {})
        self.sample_rate: int = int(audio_section.get("sample_rate", 16000))
        self.channels: int = int(audio_section.get("channels", 1))

        # VAD settings
        vad_section = config_dict.get("VAD", {})
        vad_enabled = vad_section.get("enabled", False)
        if isinstance(vad_enabled, str):
            self.vad_enabled: bool = vad_enabled.lower() == "true"
        else:
            self.vad_enabled: bool = bool(vad_enabled)

        self.vad_aggressiveness: int = int(vad_section.get("aggressiveness", 1))
        self.silence_duration_ms: int = int(
            vad_section.get("silence_duration_ms", 1000)
        )
        self.frame_duration_ms: int = int(vad_section.get("frame_duration_ms", 30))

        # Output settings
        output_section = config_dict.get("Output", {})
        self.output_method: str = output_section.get("method", "typewrite")

        # Hotkey settings
        hotkeys_section = config_dict.get("Hotkeys", {})
        self.dictation_hotkey: str = hotkeys_section.get("dictation_hotkey", "fn")
        self.action_hotkey: str = hotkeys_section.get("action_hotkey", "f10")

        # Vosk settings (expected if streaming_mode is true)
        vosk_section = config_dict.get("Vosk", {})
        self.vosk_model_path: str = vosk_section.get("model_path", "")

        # Mode settings
        mode_section = config_dict.get("Mode", {})
        self.application_mode: str = mode_section.get(
            "application_mode", "discrete"
        ).lower()

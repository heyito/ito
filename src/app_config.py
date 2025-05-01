from typing import Any, Dict


class AppConfig:
    """
    Handles application configuration loading and access.
    """
    def __init__(self, config_dict: Dict[str, Any]):
        """
        Initializes the AppConfig by parsing the configuration dictionary.

        Args:
            config_dict: The raw configuration dictionary loaded from a file or source.
        """
        # OpenAI settings
        openai_section = raw_config.get('OpenAI', {})
        self.openai_api_key: str = openai_section.get('api_key', '')
        self.openai_model: str = openai_section.get('model', 'gpt-4.1')

        # Ollama settings
        ollama_section = raw_config.get('Ollama', {})
        self.ollama_model: str = ollama_section.get('model', 'llama3.2:latest')

        # ASR settings
        asr_section: Dict[str, Any] = config_dict.get('ASR', {})
        self.asr_provider: str = asr_section.get('provider', 'openai_api')
        self.asr_model: str = asr_section.get('model', 'whisper-1')
        self.asr_local_model_size: str = asr_section.get('local_model_size', 'base.en')
        self.asr_device: str = asr_section.get('device', 'auto')
        self.asr_compute_type: str = asr_section.get('compute_type', 'default')

        # LLM settings
        llm_section = raw_config.get('LLM', {})
        self.llm_source: str = llm_section.get('source', 'openai_api')
        self.llm_model: str = self.ollama_model if self.llm_source == 'ollama' else self.openai_model
        self.max_tokens: int = int(llm_section.get('max_tokens', 2000))
        self.temperature: float = float(llm_section.get('temperature', 0.7))

        # Audio settings
        audio_section = raw_config.get('Audio', {})
        self.sample_rate: int = int(audio_section.get('sample_rate', 16000))
        self.channels: int = int(audio_section.get('channels', 1))

        # VAD settings
        vad_section = raw_config.get('VAD', {})
        vad_enabled = vad_section.get('enabled', True)
        if isinstance(vad_enabled, str):
            self.vad_enabled: bool = vad_enabled.lower() == 'true'
        else:
            self.vad_enabled: bool = bool(vad_enabled)

        self.vad_aggressiveness: int = int(vad_section.get('aggressiveness', 1))
        self.silence_duration_ms: int = int(vad_section.get('silence_duration_ms', 1000))
        self.frame_duration_ms: int = int(vad_section.get('frame_duration_ms', 30))

        # Output settings
        output_section = raw_config.get('Output', {})
        self.output_method: str = output_section.get('method', 'typewrite')

        # Hotkey settings
        hotkeys_section = raw_config.get('Hotkeys', {})
        self.start_recording_hotkey: str = hotkeys_section.get('start_recording_hotkey', 'f9')
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
        # VAD Configuration
        vad_section: Dict[str, Any] = config_dict.get('VAD', {})
        self.vad_enabled: bool = vad_section.get('enabled', 'false').lower() == 'true'
        self.vad_aggressiveness: int = int(vad_section.get('aggressiveness', 1))
        self.vad_silence_duration_ms: int = int(vad_section.get('silence_duration_ms', 1500))
        self.vad_frame_duration_ms: int = int(vad_section.get('frame_duration_ms', 30))
        self.vad_config: Dict[str, Any] = {
            'enabled': self.vad_enabled,
            'aggressiveness': self.vad_aggressiveness,
            'silence_duration_ms': self.vad_silence_duration_ms,
            'frame_duration_ms': self.vad_frame_duration_ms,
        }

        # Hotkey Configuration
        hotkey_section: Dict[str, Any] = config_dict.get('Hotkeys', {})
        self.start_recording_hotkey: str = hotkey_section.get('start_recording_hotkey', 'f9')

        # ASR Configuration
        asr_section: Dict[str, Any] = config_dict.get('ASR', {})
        self.asr_provider: str = asr_section.get('provider', 'openai_api')
        self.asr_model: str = asr_section.get('model', 'whisper-1')
        self.asr_local_model_size: str = asr_section.get('local_model_size', 'base.en')
        self.asr_device: str = asr_section.get('device', 'auto')
        self.asr_compute_type: str = asr_section.get('compute_type', 'default')
        # Pass relevant ASR config to the handler if needed upon initialization there

        # LLM Configuration
        llm_section: Dict[str, Any] = config_dict.get('LLM', {})
        self.llm_provider: str = llm_section.get('provider', 'openai_api')
        self.llm_model: str = llm_section.get('model', 'gpt-4o')
        self.llm_local_quantization: int = int(llm_section.get('local_quantization', 4))
        # Pass relevant LLM config to the handler if needed upon initialization there
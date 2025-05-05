from abc import ABC, abstractmethod


class StreamingAudioInterface(ABC):
    @abstractmethod
    def start_streaming(self):
        pass
    
    @abstractmethod
    def stop_streaming(self):
        pass
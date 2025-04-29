from abc import ABC, abstractmethod

class ApplicationInterface(ABC):
    @abstractmethod
    def run(self):
        pass
    
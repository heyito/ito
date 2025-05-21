from abc import ABC, abstractmethod
import queue


class ApplicationInterface(ABC):
    """Defines the common interface for application runners managed by ApplicationManager."""

    @abstractmethod
    def run(self) -> None:
        """Starts the main execution logic of the application runner."""
        pass

    @abstractmethod
    def trigger_interaction(self) -> None:
        """Initiates the primary action (start recording, toggle stream, etc.)."""
        pass

    @abstractmethod
    def cleanup(self) -> None:
        """Performs necessary cleanup of resources (threads, queues, etc.)."""
        pass

    # Add status_queue property if ApplicationManager always sets it
    status_queue: queue.Queue | None = None

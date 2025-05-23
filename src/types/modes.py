from enum import StrEnum


class CommandMode(StrEnum):
    DICTATION = "dictation"
    ACTION = "action"

    @staticmethod
    def default_mode() -> "CommandMode":
        """
        Returns the default command mode.
        """
        return CommandMode.DICTATION

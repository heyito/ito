from enum import StrEnum


class CommandMode(StrEnum):
    DICTATION = "dictation"
    ACTION = "action"

    default_mode = DICTATION

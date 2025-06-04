from typing import TypedDict

class Context(TypedDict):
    app_name: str

    # Refers to the context the application most cares about,
    # handled on a per app basis in src/apps
    primary_context: str

    # Optional additional context, e.g. for dictation
    page_context: str | None
from typing import TypedDict


class ToolCallDict(TypedDict):
    name: str
    arguments: str
    id: str

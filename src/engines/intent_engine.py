from enum import StrEnum

from src.handlers.llm_handler import LLMHandler


class IntentTypes(StrEnum):
    CREATE = "CREATE"
    EDIT = "EDIT"
    DELETE = "DELETE"
    SEARCH = "SEARCH"
    VIEW = "VIEW"

    @classmethod
    def from_string(cls, string: str):
        return cls[string.upper()]

system_prompt = """
You are a classification engine. Your job is to classify user commands into one of the following categories: 

- CREATE: The user wants to create something.
- EDIT: The user wants to edit something.
- DELETE: The user wants to delete something.
- SEARCH: The user wants to search for something.
- VIEW: The user wants to view something.

The user will provide you with a command and you will need to classify it into one of the above categories.

The output should be a single word from the list of categories. CREATE, EDIT, DELETE, SEARCH, or VIEW.

Do not include any other text in your response.
"""


class IntentEngine:
    def __init__(self, llm_handler: LLMHandler):
        self.llm_handler = llm_handler
        self.intent = None

    def get_intent(self, user_command: str) -> IntentTypes:
        response = self.llm_handler.process_text_with_llm(system_prompt_override=system_prompt, text=user_command)
        try:
            intent = IntentTypes.from_string(response)
        except KeyError:
            raise ValueError(f"Invalid intent from LLM: {response}")
        
        return intent

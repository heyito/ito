import json
import time
from typing import Optional

from deepdiff import DeepDiff

from src import prompt_templates
from src.engines.macos_engine import MacOSEngine
from src.handlers.llm_handler import LLMHandler

from google.genai import types

ui_batch_tool = {
    "name": "ui_batch",
    "description": "Run 1-5 low-risk UI actions back-to-back.",
    "parameters": {
        "type": "object",
        "properties": {
            "steps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "action": {
                            "type": "string",
                            "enum": [
                                "click",
                                "type_text",
                                "press_key",
                                "replace_text",
                            ],
                        },
                        "x": {"type": "integer"},
                        "y": {"type": "integer"},
                        "text": {"type": "string"},
                        "key": {"type": "string"},
                        "element_description": {
                            "type": "string",
                            "description": "A short description of the action taken",
                        },
                    },
                    "required": ["action"],
                },
                "minItems": 1,
                "maxItems": 5,
            }
        },
        "required": ["steps"],
    },
}
no_action_tool = {
    "name": "no_action",
    "description": "Indicates that no further UI action is required. Call this when the user's goal appears to be satisfied or when repeating an action would have no additional effect.",
    "parameters": {"type": "object", "properties": {}},
}

tool_functions = [ui_batch_tool, no_action_tool]

open_ai_tools = [
    {
        "type": "function",
        "function": ui_batch_tool,
    },
    {
        "type": "function",
        "function": no_action_tool,
    },
]

gemini_tools = types.Tool(function_declarations=[ui_batch_tool, no_action_tool])


class MacOSapp:
    system_prompt = prompt_templates.MACOS_AX_OCR_SYSTEM_PROMPT
    MAX_STEPS = 3

    def __init__(self, llm_handler: LLMHandler, macos_engine: MacOSEngine):
        self.llm_handler = llm_handler
        self.macos_engine = macos_engine

    def _run_atomic(self, step: dict):
        """
        Executes a single low-level action and returns a short result string.
        step = {action:'click'|'type_text'|…, x:…, y:…, text:, key:…}
        """
        a = step["action"]
        try:
            if a == "click":
                self.macos_engine.click_at_global(step["x"], step["y"])
            elif a == "type_text":
                self.macos_engine.type_text_global(step["x"], step["y"], step["text"])
            elif a == "replace_text":
                self.macos_engine.replace_text_at_global(
                    step["x"], step["y"], step["text"]
                )
            elif a == "press_key":
                self.macos_engine.press_key(step["key"])
            else:
                raise ValueError(f"Unknown action: {a}")
            return "ok"
        except Exception as e:
            return f"error: {e}"

    def get_context(self):
        context = self.macos_engine.get_active_window_info()
        return context

    """
    Process the command and update the document.

    args:
        app_name: str - The name of the application to process the command for
        processing_text: str - The json representation of the context from above
        user_text_command: str - The command to process
    """

    def process_command(
        self,
        app_name: str,
        processing_text: str,
        user_text_command: str,
        user_command_audio: Optional[bytes] = None,
    ):
        full_llm_input = prompt_templates.create_macos_ax_ocr_prompt(
            context=processing_text, command=user_text_command
        )

        def tool_name_resolver(tool_name, **args):
            if tool_name == "ui_batch":
                result = []
                for step in args["steps"]:
                    time.sleep(0.6)  # Add a small delay between actions
                    outcome = self._run_atomic(step)
                    result.append(outcome)
                return result
            elif tool_name == "no_action":
                print("No action required. Tool call completed.")
                return None
            else:
                return self._run_atomic({"action": tool_name, **args})

        old_context = processing_text

        def run_after_step(state):
            new_context = self.get_context()
            old_context = state["old_context"]
            delta = DeepDiff(old_context, new_context, verbose_level=2).to_json()
            state["old_context"] = new_context

            return {"ui_delta": delta}

        self.llm_handler.run_tool_call_process(
            tool_name_resolver=tool_name_resolver,
            run_after_step=run_after_step,
            tool_functions=tool_functions,
            system_prompt=self.system_prompt,
            user_prompt=full_llm_input,
            max_steps=self.MAX_STEPS,
            state={"old_context": old_context},
        )

        print("Processing complete.")

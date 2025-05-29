import json
import logging
import time

from deepdiff import DeepDiff
from google.genai import types

from src.engines.macos_engine import MacOSEngine
from src.handlers.llm_handler import LLMHandler
from src.prompts import prompt_templates
from src.types.context import Context

logger = logging.getLogger(__name__)

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
                        # "element_description": {
                        #     "type": "string",
                        #     "description": "A short description of the action taken",
                        # },
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
    action_system_prompt = prompt_templates.MACOS_AX_OCR_SYSTEM_PROMPT
    dictation_system_prompt = prompt_templates.PAGE_EDITOR_SYSTEM_PROMPT
    MAX_STEPS = 3

    def __init__(self, llm_handler: LLMHandler, macos_engine: MacOSEngine):
        self.llm_handler = llm_handler
        self.macos_engine = macos_engine

    def _run_atomic(self, step: dict) -> str:
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

    def get_context(self) -> str:
        context = self.macos_engine.get_active_window_info()
        return context

    def get_focused_cursor_context(self) -> str:
        context = self.macos_engine.copy_text_from_active_app()
        return context

    """
    Process the command and update the document.

    args:
        app_name: str - The name of the application to process the command for
        processing_text: str - The json representation of the context from above
        user_text_command: str - The command to process
    """

    def process_action(
        self,
        primary_context: str,
        user_text_command: str,
        user_command_audio: bytes | None = None,
    ):
        full_llm_input = prompt_templates.create_macos_ax_ocr_prompt(
            context=primary_context, command=user_text_command
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
                logger.info("No action required. Tool call completed.")
                return None
            else:
                return self._run_atomic({"action": tool_name, **args})

        old_context = primary_context

        def run_after_step(state: dict):
            new_context = self.get_context()
            old_context = state["old_context"]
            delta = DeepDiff(old_context, new_context, verbose_level=2).to_json()
            state["old_context"] = new_context

            return json.dumps({"ui_delta": delta})

        self.llm_handler.run_tool_call_process(
            tool_name_resolver=tool_name_resolver,
            run_after_step=run_after_step,
            tool_functions=tool_functions,
            system_prompt=self.action_system_prompt,
            user_prompt=full_llm_input,
            max_steps=self.MAX_STEPS,
            state={"old_context": old_context},
        )

        logger.info("Processing complete.")

    def process_dictation(
        self,
        context: Context,
        user_text_command: str,
        user_command_audio: bytes | None = None,
    ):
        full_llm_input = prompt_templates.create_general_document_body_prompt(
            context["app_name"],
            context["primary_context"],
            user_text_command,
            context["page_context"],
        )
        new_primary_context = self.llm_handler.process_input_with_llm(
            text=full_llm_input,
            audio_buffer=user_command_audio,
            system_prompt_override=self.dictation_system_prompt,
        )

        if new_primary_context is None:  # Check for None specifically
            logger.error("LLM processing failed or did not return content.")
            # is_processing is released in finally block
            return
        logger.info(
            f"LLM returned new document content (length: {len(new_primary_context)} chars)."
        )

        logger.info(f"New document content:\n---\n{new_primary_context[:200]}...\n---")
        self.macos_engine.paste_text_to_active_app(new_primary_context)

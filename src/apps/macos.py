import json
import time
from typing import Optional

from deepdiff import DeepDiff, Delta

from src import prompt_templates
from src.engines.macos_engine import MacOSEngine
from src.handlers.llm_handler import LLMHandler

llm_tools = [
    # {
    #     "type": "function",
    #     "function": {
    #         "name": "click",
    #         "description": "Click at a specific screen coordinate.",
    #         "parameters": {
    #             "type": "object",
    #             "properties": {"x": {"type": "integer"}, "y": {"type": "integer"}},
    #             "required": ["x", "y"],
    #         },
    #     },
    # },
    # {
    #     "type": "function",
    #     "function": {
    #         "name": "type_text",
    #         "description": "Type a string at a coordinate (assumes field is focused by clicking there).",
    #         "parameters": {
    #             "type": "object",
    #             "properties": {
    #                 "x": {"type": "integer"},
    #                 "y": {"type": "integer"},
    #                 "text": {"type": "string"},
    #             },
    #             "required": ["x", "y", "text"],
    #         },
    #     },
    # },
    # {
    #     "type": "function",
    #     "function": {
    #         "name": "press_key",
    #         "description": "Presses a special key or key combination, such as 'Enter', 'Cmd+C', or arrow keys.",
    #         "parameters": {
    #             "type": "object",
    #             "properties": {
    #                 "key": {
    #                     "type": "string",
    #                     "description": "Special key or key combination. Supported values include modifier combos.",
    #                     "enum": [
    #                         "enter",
    #                         "escape",
    #                         "tab",
    #                         "space",
    #                         "up",
    #                         "down",
    #                         "left",
    #                         "right",
    #                         "cmd+a",
    #                         "cmd+c",
    #                         "cmd+v",
    #                         "cmd+z",
    #                         "cmd+x",
    #                         "cmd+a",
    #                         "cmd+c",
    #                         "cmd+v",
    #                         "cmd+w",
    #                         "cmd+q",
    #                         "cmd+enter",
    #                         "shift+tab",
    #                         "shift+enter",
    #                     ],
    #                 }
    #             },
    #             "required": ["key"],
    #         },
    #     },
    # },
    # {
    #     "type": "function",
    #     "function": {
    #         "name": "replace_text",
    #         "description": "Replace the contents of a text field with new content at the specified screen coordinate.",
    #         "parameters": {
    #             "type": "object",
    #             "properties": {
    #                 "x": {
    #                     "type": "integer",
    #                     "description": "The x-coordinate of the text field center.",
    #                 },
    #                 "y": {
    #                     "type": "integer",
    #                     "description": "The y-coordinate of the text field center.",
    #                 },
    #                 "text": {
    #                     "type": "string",
    #                     "description": "The full new content to replace the existing text.",
    #                 },
    #             },
    #             "required": ["x", "y", "text"],
    #         },
    #     },
    # },
    {
        "type": "function",
        "function": {
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
        },
    },
    {
        "type": "function",
        "function": {
            "name": "no_action",
            "description": "Indicates that no further UI action is required. Call this when the user's goal appears to be satisfied or when repeating an action would have no additional effect.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]


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

    def process_command(self, app_name: str, processing_text: str, user_text_command: str, user_command_audio: Optional[bytes] = None):
        full_llm_input = prompt_templates.create_macos_ax_ocr_prompt(
            context=processing_text, command=user_text_command
        )

        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": full_llm_input},
        ]

        # if response is None:  # Check for None specifically
        #     print("LLM processing failed or did not return content.")
        #     # is_processing is released in finally block
        #     return  # Exit processing early

        steps = 0
        old_context = processing_text

        while steps < self.MAX_STEPS:
            resp = self.llm_handler.process_input_with_llm(
                text=full_llm_input,  # Pass combined context+command as user message content
                audio_buffer=user_command_audio,
                system_prompt_override=self.system_prompt,  # Pass the system prompt from config
                tools=llm_tools,
                messages_override=messages,
            )
            tool_calls = resp.choices[0].message.tool_calls
            if not tool_calls:
                print(resp.choices[0].message.content or "done")
                break

            print("Tool calls:", tool_calls)

            messages.append({"role": "assistant", "tool_calls": tool_calls})

            tool_result_messages = []
            tool_call = tool_calls[0]
            tool_name = tool_call.function.name
            args = json.loads(tool_call.function.arguments)
            result = None

            if tool_name == "ui_batch":
                result = []
                for step in args["steps"]:
                    time.sleep(0.6)  # Add a small delay between actions
                    outcome = self._run_atomic(step)
                    result.append(outcome)
            elif tool_name == "no_action":
                print("No action required. Tool call completed.")
                break
            else:
                result = self._run_atomic({"action": tool_name, **args})

            tool_result_messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": tool_call.function.name,
                    "content": json.dumps({"result": result}),
                }
            )
            messages.extend(tool_result_messages)

            new_context = self.get_context()
            delta = DeepDiff(old_context, new_context, verbose_level=2).to_json()

            messages.append(
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "ui_delta": delta,
                            "user_text_command": user_text_command,
                        }
                    ),
                }
            )
            old_context = new_context
            steps += 1

        print("Processing complete.")

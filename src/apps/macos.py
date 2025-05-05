import json
import time

from src import prompt_templates
from src.engines.macos_engine import MacOSEngine
from src.handlers.llm_handler import LLMHandler

llm_tools = [
    {
        "type": "function",
        "function": {
            "name": "click",
            "description": "Click at a specific screen coordinate.",
            "parameters": {
                "type": "object",
                "properties": {
                    "x": { "type": "integer" },
                    "y": { "type": "integer" }
                },
                "required": ["x", "y"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "type_text",
            "description": "Type a string at a coordinate (assumes field is focused by clicking there).",
            "parameters": {
                "type": "object",
                "properties": {
                    "x": { "type": "integer" },
                    "y": { "type": "integer" },
                    "text": { "type": "string" }
                },
                "required": ["x", "y", "text"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "press_key",
            "description": "Presses a special key or key combination, such as 'Enter', 'Cmd+C', or arrow keys.",
            "parameters": {
                "type": "object",
                "properties": {
                    "key": {
                        "type": "string",
                        "description": "Special key or key combination. Supported values include modifier combos.",
                        "enum": [
                            "enter", "escape", "tab", "space",
                            "up", "down", "left", "right",
                            "cmd+a", "cmd+c", "cmd+v", "cmd+z", "cmd+x",
                            "ctrl+a", "ctrl+c", "ctrl+v",
                            "shift+tab", "shift+enter"
                        ]
                    }
                },
                "required": ["key"]
            }   

        }
    },
    
    {
        "type": "function",
        "function": {
            "name": "replace_text",
            "description": "Replace the contents of a text field with new content at the specified screen coordinate.",
            "parameters": {
                "type": "object",
                "properties": {
                    "x": { "type": "integer", "description": "The x-coordinate of the text field center." },
                    "y": { "type": "integer", "description": "The y-coordinate of the text field center." },
                    "text": {
                        "type": "string",
                        "description": "The full new content to replace the existing text."
                    }
                },
                "required": ["x", "y", "text"]
            }
        }
    }
] 

class MacOSapp: 
    system_prompt = prompt_templates.MACOS_AX_OCR_SYSTEM_PROMPT

    def __init__(self, llm_handler: LLMHandler, macos_engine: MacOSEngine):
        self.llm_handler = llm_handler
        self.macos_engine = macos_engine
        
    def get_context(self):
        context = self.macos_engine.get_active_window_info()
        return context

    """
    Process the command and update the document.

    args:
        app_name: str - The name of the application to process the command for
        processing_text: str - The json representation of the context from above
        user_command: str - The command to process
    """
    def process_command(self, app_name: str, processing_text: str, user_command: str):
        full_llm_input = prompt_templates.create_macos_ax_ocr_prompt(
            context=processing_text,
            command=user_command
        )

        response = self.llm_handler.process_text_with_llm(
            text=full_llm_input, # Pass combined context+command as user message content
            system_prompt_override=self.system_prompt, # Pass the system prompt from config
            tools=llm_tools
        )

        if response is None: # Check for None specifically
            print("LLM processing failed or did not return content.")
            # is_processing is released in finally block
            return # Exit processing early
        
        for tool_call in response: 
            tool_name = tool_call.function.name
            args = json.loads(tool_call.function.arguments)
            print(f"Tool call: {tool_name} with args: {args}")
            time.sleep(.4) # Potentially going too fast right now 
            if tool_name == "click":
                print(f"Clicking at {args['x']}, {args['y']}")
                self.macos_engine.click_at_global(args["x"], args["y"])
            elif tool_name == "type_text":
                print(f"Typing at {args['x']}, {args['y']} with text: {args['text']}")
                self.macos_engine.type_text_global(args["x"], args["y"], args["text"])
            elif tool_name == "replace_text":
                print(f"Replacing text at {args['x']}, {args['y']} with text: {args['text']}")
                self.macos_engine.replace_text_at_global(args["x"], args["y"], args["text"])
            elif tool_name == "press_key":
                print(f"Pressing key: {args['key']}")
                self.macos_engine.press_key(args["key"])
        
        # result = json.loads(response)

        # print(f"Result: {result}")

        # if result['action'] == 'none':
        #     print("No action to take.")
        #     return
        # elif result['action'] == 'click':
        #     self.macos_engine.click_at_global(result['x'], result['y'])
        # elif result['action'] == 'type_text':
        #     self.macos_engine.type_text_global(result['x'], result['y'], result['text'])
        # else:
        #     print(f"Unknown action: {result['action']}")
        #     raise Exception(f"Unknown action: {result['action']}")


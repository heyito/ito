import json
import logging
import time
from collections.abc import Callable
from typing import Any

from src.clients.llm_client_interface import LLMClientInterface
from src.utils.timing import time_method

# Configure logging
logger = logging.getLogger(__name__)

# Default System Prompt (can be configured or overridden)
DEFAULT_LLM_SYSTEM_PROMPT = "You are a helpful AI assistant."


class LLMHandler:
    def __init__(self, client: LLMClientInterface):
        """
        Initializes the LLMHandler with a specific LLM client.

        Args:
            client: An instance of a class that implements LLMClientInterface.
        """
        self.client = client
        self.is_client_available = self.client.check_availability()

        if self.is_client_available:
            logger.info(
                f"LLMHandler initialized with client: {self.client.source_name}, model: {self.client.user_command_model_name}"
            )
        else:
            logger.warning(
                f"LLMHandler WARNING: Client {self.client.source_name} is not available or not configured correctly."
            )

    @time_method
    # text and audio are optional, but at least one must be provided
    def process_input_with_llm(
        self,
        text: str,
        audio_buffer: bytes,
        system_prompt_override: str | None = None,  # Use Optional
        max_tokens: int = 4096,
        temperature: float = 0.7,
        tool_functions: list[dict] | None = None,  # Use Optional
        messages_override: list[dict] | None = None,  # Use Optional
    ) -> Any:  # Return type depends on client (string or OpenAI response object)
        """
        Processes text using the configured LLM client.

        Args:
            text: The user's message content (context + command)
            system_prompt_override: Optional override for the system prompt
            max_tokens: Maximum number of tokens to generate
            temperature: Sampling temperature (0.0 to 1.0)
            tools: list of tools available to the model
            messages_override: Optional override for the message history

        Returns:
            The processed response from the LLM, or None if processing failed.
            This can be a string or an OpenAI response object if tools are used.
        """
        start_time = time.time()

        if not text and not messages_override and not audio_buffer:
            logger.warning(
                "LLMHandler: Received empty text for user message and no messages_override and no audio_buffer."
            )
            return None

        # Determine the system prompt to use
        # If messages_override is provided, it might already contain a system message.
        # The client's generate_response method should handle how system_prompt and messages_override interact.
        system_prompt = (
            system_prompt_override
            if system_prompt_override
            else DEFAULT_LLM_SYSTEM_PROMPT
        )
        if (
            not system_prompt
        ):  # Ensure system_prompt is not empty if it's going to be used
            logger.warning(
                "LLMHandler Warning: LLM system prompt is empty. Using a default space."
            )
            system_prompt = " "

        try:
            if audio_buffer:
                logger.info("LLMHandler: Generating response with audio.")
                response = self.client.generate_response_with_audio(
                    audio_buffer=audio_buffer,
                    text=text,
                    system_prompt=system_prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    tools=tool_functions or [],  # Pass empty list if None
                    messages_override=messages_override
                    or [],  # Pass empty list if None
                )
            else:
                response = self.client.generate_response(
                    text=text,
                    system_prompt=system_prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    tool_functions=tool_functions or [],  # Pass empty list if None
                    messages_override=messages_override
                    or [],  # Pass empty list if None
                )

            if response is not None:
                pass  # Response is already in desired format from client
            else:
                logger.error(
                    f"LLMHandler: Received no response or an error from {self.client.source_name}."
                )
                raise Exception(f"No response from {self.client.source_name}.")

            end_time = time.time()
            logger.info(
                f"{self.client.source_name} LLM API response time for model {self.client.user_command_model_name}: {end_time - start_time:.2f} seconds"
            )
            return response

        except Exception as e:
            logger.error(
                f"LLMHandler: An unexpected error occurred while calling client's generate_response: {e}"
            )
            import traceback

            logger.error(traceback.format_exc())
            raise Exception(f"Error processing input with LLM: {e}") from e

    def run_tool_call_process(
        self,
        tool_name_resolver: Callable[..., str],  # takes input: tool_name, **args
        run_after_step: Callable[[dict], str],
        tool_functions: list[dict],
        system_prompt: str,
        user_prompt: str,
        max_steps: int = 5,
        state: dict | None = None,
    ):
        """
        tool_name_resolver: Function that takes a tool name as an argument with kwargs
        """
        messages = self.client.format_system_user_messages(
            system_prompt=system_prompt, user_prompt=user_prompt
        )

        steps = 0
        all_tool_calls = {}
        while steps < max_steps:
            resp = self.client.generate_response(
                text="",
                system_prompt="",
                max_tokens=4096,
                temperature=0.7,
                tool_functions=tool_functions,
                messages_override=messages,
            )
            tool_calls = self.client.extract_tool_calls(resp)
            if not tool_calls:
                break

            is_complete = False
            for tool_call in tool_calls:
                tool_name = tool_call["name"]
                tool_call_id = tool_call["id"]
                args = json.loads(tool_call["arguments"])

                result = tool_name_resolver(tool_name, **args)
                if result is None:
                    is_complete = True
                    break
                if result is not str:
                    result = str(result)

                tool_messages = self.client.format_tool_result_messages(
                    tool_id=tool_call_id, name=tool_name, args=args, result=result
                )
                messages.extend(tool_messages)

                all_tool_calls[f"{tool_name}_{steps}"] = args

            if is_complete:
                break

            steps += 1
            user_info = run_after_step(state)
            if user_info:
                messages.append(self.client.format_user_message(content=user_info))

        logger.info(f"Tool call report {tool_name} {steps}")
        logger.info(all_tool_calls)

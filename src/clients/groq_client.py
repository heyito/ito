import io
import json
import re
from typing import Any, Dict, List, Optional
from groq import Groq, GroqError

from src.clients.llm_client_interface import LLMClientInterface
from src.utils.timing import time_method


class GroqClient(LLMClientInterface):
    def __init__(self, api_key: str, user_command_model: str, asr_model: str):
        if not api_key:
            raise ValueError("Groq API key is required.")

        self._api_key = api_key
        self._user_command_model = user_command_model
        self._asr_model = asr_model
        self._client = Groq(api_key=self._api_key)
        self._is_valid = True

    @property
    def source_name(self) -> str:
        return "groq_api"

    @property
    def user_command_model_name(self) -> str:
        return self._user_command_model

    @property
    def asr_model_name(self) -> str:
        return self._asr_model

    def check_availability(self) -> bool:
        if not self._api_key:
            print("GroqClient ERROR: API key is missing.")
            self._is_valid = False
            return False
        print("GroqClient: API key is present.")
        self._is_valid = True
        return True

    @time_method
    def generate_response(
        self,
        text: str,
        system_prompt: str,
        max_tokens: int,
        temperature: float,
        tool_functions: Optional[List[dict]] = None,
        messages_override: Optional[List[Dict]] = None,
    ) -> Any:
        if (
            not self._is_valid
        ):  # Relies on check_availability being called or key presence
            print(
                "GroqClient ERROR: API key is invalid or missing. Cannot process request."
            )
            return None

        if not self._user_command_model:
            raise ValueError("Groq user command model is required.")

        actual_tools = self.tool_functions_to_openai_format(tool_functions)

        try:
            response = self._client.chat.completions.create(
                model=self._user_command_model,
                messages=messages_override
                or [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
                tools=actual_tools,
                tool_choice="required" if len(tool_functions) != 0 else "none",
            )

            if not actual_tools:  # If no tools were intended, process as text
                processed_text = response.choices[0].message.content
                print(f"OpenAIClient returned processed text: {processed_text}")
                if processed_text:
                    # Remove markdown ```json ... ```
                    return re.sub(
                        r"^```json\s*|\s*```$",
                        "",
                        processed_text.strip(),
                        flags=re.MULTILINE,
                    )
                else:
                    return ""
            else:
                # If tools were used, return the full response object
                # The caller (LLMHandler or its user) will handle this.
                print("GroqClient returned tool call response object.")
                return response

        except GroqError as e:
            print(f"Groq API Error during LLM processing: {e}")
            if hasattr(e, "body") and e.body:
                print(f"Error Body: {e.body}")
            return None
        except Exception as e:
            print(f"An unexpected error occurred during Groq LLM processing: {e}")
            import traceback

            traceback.print_exc()
            return None
        
    def generate_response_with_audio(
        self,
        audio_buffer: bytes,
        text: str,
        system_prompt: str,
        max_tokens: int,
        temperature: float,
        tools: list[dict] = [],
        messages_override: Optional[List[Dict]] = None,
    ) -> Any:
        raise NotImplementedError("Groq client does not support multi modal responses.")

    @time_method
    def transcribe_audio(self, audio_buffer: io.BytesIO) -> str:
        """Transcribes audio using the Groq API."""
        if not self._client:
            print("Error: Groq client not initialized.")
            return ""

        if not self._asr_model:
            raise ValueError("Groq ASR model is required.")

        try:
            # The Whisper API needs a filename hint, especially for format detection.
            audio_buffer.name = "audio.wav"

            transcript_response = self._client.audio.transcriptions.create(
                model=self._asr_model,
                file=audio_buffer,
                response_format="text",  # Explicitly request text
            )

            # Ensure the response is treated as a string
            transcript = (
                transcript_response if isinstance(transcript_response, str) else ""
            )
            return transcript.strip()

        except GroqError as e:
            print(f"Groq API Error during transcription: {e}")
            return ""
        except Exception as e:
            # Catch broader exceptions during the API call
            print(f"An unexpected error occurred during Groq transcription: {e}")
            return ""

    def format_messages(self, system_prompt: str, user_prompt: str) -> List[Dict]:
        """
        Formats the messages for the Groq API.
        """
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    def format_tool_message(id: str, name: str, result: str):
        return {
            "role": "tool",
            "tool_call_id": id,
            "name": name,
            "content": json.dumps({"result": result}),
        }

    def format_user_message(content):
        return {"role": "user", "content": json.dumps(content)}

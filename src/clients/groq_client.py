import re
from typing import Any, Dict, List, Optional
from groq import Groq, GroqError
class GroqClient:
    def __init__(self, api_key: str, model: str):
        if not api_key:
            raise ValueError("Groq API key is required.")
        if not model:
            raise ValueError("Groq model name is required.")

        self._api_key = api_key
        self._model = model
        self._client = Groq(api_key=self._api_key)
        self._is_valid = True

    @property
    def source_name(self) -> str:
        return "groq_api"

    @property
    def model_name(self) -> str:
        return self._model

    def check_availability(self) -> bool:
        if not self._api_key:
            print("GroqClient ERROR: API key is missing.")
            self._is_valid = False
            return False
        print("GroqClient: API key is present.")
        self._is_valid = True
        return True
    
    def generate_response(
        self,
        text: str,
        system_prompt: str,
        max_tokens: int,
        temperature: float,
        tools: list[dict] = [],
        messages_override: Optional[List[Dict]] = None,
    ) -> Any:
        if not self._is_valid: # Relies on check_availability being called or key presence
             print("GroqClient ERROR: API key is invalid or missing. Cannot process request.")
             return None

        actual_tools = tools or [] # Ensure tools is a list

        try:

            response = self._client.chat.completions.create(
                model=self._model,
                messages=messages_override
                or [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
                tools=tools,
                tool_choice="required" if len(tools) != 0 else "none",
            )

            if not actual_tools: # If no tools were intended, process as text
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
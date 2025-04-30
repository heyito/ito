import re
from openai import OpenAI, OpenAIError
import requests
import time
import json

# --- Default System Prompt (if none provided) ---
DEFAULT_LLM_SYSTEM_PROMPT = "You are a helpful AI assistant."

class LLMHandler:
    def __init__(self, llm_source: str, llm_model: str, openai_api_key: str):
        self.model_cache = {}
        self.tokenizer_cache = {}

        # Assign the received values directly
        self.llm_source = llm_source
        self.llm_model = llm_model
        self.openai_api_key = openai_api_key
        self.ollama_running = False
        self.openai_valid = False

        # Now self.llm_source etc. hold the actual values
        print(f"LLM Provider: {self.llm_source}")
        print(f"LLM Model: {self.llm_model}")

        if self.llm_source == "ollama":
            self.ollama_running = self._check_ollama_running()
            if not self.ollama_running:
                print("WARNING: Ollama is not running. Please start Ollama before using it.")
        elif self.llm_source == "openai_api":
            self.openai_valid = self._validate_openai_key()
            if not self.openai_valid:
                print("WARNING: OpenAI API key is invalid or missing. Please check your configuration.")

    def _validate_openai_key(self) -> bool:
        """
        Validate the OpenAI API key by making a simple request.
        
        Returns:
            bool: True if the API key is valid, False otherwise
        """
        if not self.openai_api_key or self.openai_api_key.strip() == "":
            print("OpenAI API key is empty")
            return False

        try:
            client = OpenAI(api_key=self.openai_api_key)
            # Make a simple request to validate the key
            client.models.list()
            print("OpenAI API key is valid")
            return True
        except OpenAIError as e:
            if "Incorrect API key" in str(e):
                print("OpenAI API key is invalid")
            else:
                print(f"Error validating OpenAI API key: {e}")
            return False
        except Exception as e:
            print(f"Unexpected error validating OpenAI API key: {e}")
            return False

    def _check_ollama_running(self, max_retries: int = 3, retry_delay: float = 1.0) -> bool:
        """
        Check if Ollama is running by attempting to connect to its API.
        
        Args:
            max_retries: Maximum number of connection attempts
            retry_delay: Delay between retries in seconds
            
        Returns:
            bool: True if Ollama is running, False otherwise
        """
        for attempt in range(max_retries):
            try:
                response = requests.get("http://localhost:11434/api/tags", timeout=5)
                if response.status_code == 200:
                    print("Ollama is running and accessible")
                    return True
            except requests.exceptions.RequestException as e:
                if attempt < max_retries - 1:
                    print(f"Attempt {attempt + 1}/{max_retries}: Ollama not responding, retrying in {retry_delay} seconds...")
                    time.sleep(retry_delay)
                else:
                    print(f"Failed to connect to Ollama after {max_retries} attempts: {e}")
        return False

    def process_text_with_llm(
        self,
        text: str,
        system_prompt_override: str = None,
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ):
        """
        Processes text using the specified LLM provider.
        
        Args:
            text: The user's message content (context + command)
            system_prompt_override: Optional override for the system prompt
            max_tokens: Maximum number of tokens to generate
            temperature: Sampling temperature (0.0 to 1.0)
            
        Returns:
            str: The processed text, or None if processing failed
        """
        print(f"Sending context and command to LLM ({self.llm_source}, {self.llm_model})...")
        print(f"System prompt: {system_prompt_override}")
        print(f"Full LLM input:\n---\n{text}\n---")
        print("Sending to LLM...")

        if not text:
            print("LLM Handler: Received empty text for user message.")
            return None

        # Determine the system prompt to use
        system_prompt = system_prompt_override if system_prompt_override else DEFAULT_LLM_SYSTEM_PROMPT
        if not system_prompt:
            print("Warning: LLM system prompt is empty.")
            system_prompt = " " # Use a space to avoid errors with empty system message

        if self.llm_source == "openai_api":
            if not self.openai_valid:
                print("Error: OpenAI API key is invalid or missing. Please check your configuration.")
                return None

            try:
                client = OpenAI(api_key=self.openai_api_key)
                print(f"Sending request to OpenAI LLM API (model: {self.llm_model})...")

                response = client.chat.completions.create(
                    model=self.llm_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": text}
                    ],
                    temperature=temperature,
                    max_tokens=max_tokens
                )

                processed_text = response.choices[0].message.content
                print(f"LLM returned processed text: {processed_text}")
                if processed_text:
                    return re.sub(r"^```json\s*|\s*```$", "", processed_text.strip(), flags=re.MULTILINE)
                else:
                    return ""

            except OpenAIError as e:
                print(f"OpenAI API Error during LLM processing: {e}")
                if hasattr(e, 'body') and e.body:
                    print(f"Error Body: {e.body}")
                return None
            except Exception as e:
                print(f"An unexpected error occurred during LLM processing: {e}")
                import traceback
                traceback.print_exc()
                return None

        elif self.llm_source == "ollama":
            if not self.ollama_running:
                print("Error: Ollama is not running. Please start Ollama before using it.")
                return None

            try:
                # Compose prompt with system prompt if provided
                system_prompt = system_prompt_override if system_prompt_override else DEFAULT_LLM_SYSTEM_PROMPT
                full_prompt = f"{system_prompt}\n\nUser: {text}\nAssistant:"
                print(f"Sending request to Ollama (model: {self.llm_model})...")

                response = requests.post(
                    "http://localhost:11434/api/generate",
                    json={
                        "model": self.llm_model,
                        "prompt": full_prompt,
                        "options": {
                            "temperature": temperature,
                            "num_predict": max_tokens
                        }
                    },
                    stream=True,  # Enable streaming
                    timeout=120
                )
                response.raise_for_status()

                # Process streaming response
                full_response = ""
                for line in response.iter_lines():
                    if line:
                        try:
                            chunk = json.loads(line)
                            if "response" in chunk:
                                full_response += chunk["response"]
                        except json.JSONDecodeError as e:
                            print(f"Error decoding JSON chunk: {e}")
                            continue

                print(f"Ollama returned processed text: {full_response}")
                return full_response.strip()

            except Exception as e:
                print(f"Error during Ollama LLM processing: {e}")
                import traceback
                traceback.print_exc()
                return None

        else:
            print(f"Error: Unknown LLM provider '{self.llm_source}'")
            return None

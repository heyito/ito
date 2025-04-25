from openai import OpenAI, OpenAIError
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
import platform
from typing import Optional # Import Optional

# --- Default System Prompt (if none provided) ---
# You might want to move this to config or keep it simple here
DEFAULT_LLM_SYSTEM_PROMPT = "You are a helpful AI assistant."
class LLMHandler:
    def __init__(self, llm_source: str, llm_model: str, openai_api_key: str,
                 local_quantization: Optional[int]): # Receives int or None
        self.model_cache = {}
        self.tokenizer_cache = {}

        # Assign the received values directly
        self.llm_source = llm_source
        self.llm_model = llm_model
        self.openai_api_key = openai_api_key
        # Handle the optional value (which might be None)
        self.local_quantization = local_quantization if local_quantization is not None else 4 # Default if None

        # Now self.llm_source etc. hold the actual values
        print(f"LLM Provider: {self.llm_source}")
        print(f"LLM Model: {self.llm_model}")
        print(f"Local Quantization: {self.local_quantization}")

        # Use the retrieved values for the rest of the logic
        if self.llm_source == "local_llm":
            print("Preloading local model...")
            self._preload_local_model(
                model_name=self.llm_model,
                quantization=self.local_quantization # Use the value (already defaulted if was None)
            )
        elif self.llm_source == "openai_api" and not self.openai_api_key:
             # Check specifically for empty string or placeholder if needed
             print("WARNING: OpenAI provider selected but API key might be missing or invalid.")

    def _get_available_device(self):
        """Determine the best available device for PyTorch."""
        if torch.backends.mps.is_available():
            return "mps"
        elif torch.cuda.is_available():
            return "cuda"
        return "cpu"

    def _load_quantized_model(self, model_name, quantization=4, device=None):
        """Load model with quantization for reduced memory usage."""
        if quantization == 4:
            # Force CPU for quantized models since bitsandbytes has issues with MPS
            device = "cpu"
            quantization_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_use_double_quant=True
            )
        else:
            quantization_config = None

        print(f"Loading model {model_name} with {quantization}-bit quantization on {device}...")
        
        # For MPS, we need to handle device mapping differently
        if device == "mps":
            model = AutoModelForCausalLM.from_pretrained(
                model_name,
                device_map=None,  # Don't use auto device mapping for MPS
                quantization_config=quantization_config,
                trust_remote_code=True
            )
            model = model.to(device)  # Move model to MPS device
        else:
            model = AutoModelForCausalLM.from_pretrained(
                model_name,
                device_map="auto",
                quantization_config=quantization_config,
                trust_remote_code=True
            )
        
        return model

    def _preload_local_model(self, model_name, quantization=4, device=None):
        """Preload the local model and tokenizer into memory."""
        if device is None:
            device = self._get_available_device()
        
        cache_key = f"{model_name}_{device}_{quantization}"
        if cache_key not in self.model_cache:
            print(f"Preloading local model: {model_name} on {device}")
            self.model_cache[cache_key] = self._load_quantized_model(model_name, quantization, device)
            self.tokenizer_cache[cache_key] = AutoTokenizer.from_pretrained(model_name)
            print(f"Successfully preloaded model: {model_name}")
        else:
            print(f"Model {model_name} already preloaded")
        return self.model_cache[cache_key], self.tokenizer_cache[cache_key]

    def _get_or_load_model(self, model_name, quantization=4, device=None):
        """Get model from cache or load if not present."""
        if device is None:
            device = self._get_available_device()
        
        cache_key = f"{model_name}_{device}_{quantization}"
        if cache_key not in self.model_cache:
            self.model_cache[cache_key] = self._load_quantized_model(model_name, quantization, device)
            self.tokenizer_cache[cache_key] = AutoTokenizer.from_pretrained(model_name)
        return self.model_cache[cache_key], self.tokenizer_cache[cache_key]

    def process_text_with_llm(
        self,
        text: str,
        system_prompt_override: str = None,
        quantization: int = 4,
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ):
        """
        Processes text using the specified LLM provider.
        
        Args:
            text: The user's message content (context + command)
            provider: The LLM provider to use ('openai_api' or 'local_llm')
            api_key: API key for the provider (required for openai_api)
            model: Model name to use
            system_prompt_override: Optional override for the system prompt
            quantization: Bit width for model quantization (4 or 8)
            max_tokens: Maximum number of tokens to generate
            temperature: Sampling temperature (0.0 to 1.0)
            device: Optional device to use ('mps', 'cuda', or 'cpu')
            
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
            if not self.openai_api_key:
                print("Error: OpenAI API key is required for openai_api provider.")
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
                return processed_text.strip() if processed_text else ''

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

        elif self.llm_source == "local_llm":
            try:
                # Get or load the model and tokenizer using instance variables
                device = self._get_available_device()
                quant_val = self.local_quantization if self.local_quantization is not None else 4
                model_instance, tokenizer_instance = self._get_or_load_model(self.llm_model, quant_val, device)
                
                # Construct prompt with system and user messages
                full_prompt = f"{system_prompt}\n\nUser: {text}\nAssistant:"
                
                # Tokenize input and move to correct device
                inputs = tokenizer_instance(full_prompt, return_tensors="pt")
                if device:
                    # Properly move each tensor in the dictionary to the device
                    inputs = {k: v.to(device) for k, v in inputs.items()}
                
                print(f"Generating response with {model_instance.config._name_or_path} on {model_instance.device}...")
                
                # Generate response
                outputs = model_instance.generate(
                    inputs["input_ids"],  # Use dictionary access instead of attribute
                    max_new_tokens=max_tokens,
                    temperature=temperature,
                    top_p=0.95,
                    do_sample=True,
                    pad_token_id=tokenizer_instance.pad_token_id
                )
                
                # Decode and return only the new tokens
                response = tokenizer_instance.decode(outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
                print(f"Local model returned processed text: {response}")
                return response.strip()
                
            except ImportError as e:
                print(f"Import Error: {str(e)}")
                print("Please install required packages:")
                print("pip install torch transformers accelerate bitsandbytes")
                return None
            except Exception as e:
                print(f"Error during model loading/inference: {str(e)}")
                import traceback
                traceback.print_exc()
                return None

        else:
            print(f"Error: Unknown LLM provider '{self.llm_source}'")
            return None

    def process_image_with_llm(
        self,
        image_path: str,
    ):
        """
        Processes an image using the specified LLM provider.
        """
        pass 
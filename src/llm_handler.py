from openai import OpenAI, OpenAIError
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
import platform

# --- Default System Prompt (if none provided) ---
# You might want to move this to config or keep it simple here
DEFAULT_LLM_SYSTEM_PROMPT = "You are a helpful AI assistant."

# Global cache for model and tokenizer
_model_cache = {}
_tokenizer_cache = {}

def get_available_device():
    """Determine the best available device for PyTorch."""
    if torch.backends.mps.is_available():
        return "mps"
    elif torch.cuda.is_available():
        return "cuda"
    return "cpu"

def load_quantized_model(model_name, quantization=4, device=None):
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

def preload_local_model(model_name, quantization=4, device=None):
    """Preload the local model and tokenizer into memory."""
    if device is None:
        device = get_available_device()
    
    cache_key = f"{model_name}_{device}_{quantization}"
    if cache_key not in _model_cache:
        print(f"Preloading local model: {model_name} on {device}")
        _model_cache[cache_key] = load_quantized_model(model_name, quantization, device)
        _tokenizer_cache[cache_key] = AutoTokenizer.from_pretrained(model_name)
        print(f"Successfully preloaded model: {model_name}")
    else:
        print(f"Model {model_name} already preloaded")
    return _model_cache[cache_key], _tokenizer_cache[cache_key]

def get_or_load_model(model_name, quantization=4, device=None):
    """Get model from cache or load if not present."""
    if device is None:
        device = get_available_device()
    
    cache_key = f"{model_name}_{device}_{quantization}"
    if cache_key not in _model_cache:
        _model_cache[cache_key] = load_quantized_model(model_name, quantization, device)
        _tokenizer_cache[cache_key] = AutoTokenizer.from_pretrained(model_name)
    return _model_cache[cache_key], _tokenizer_cache[cache_key]

def process_text_with_llm(
    text: str,
    provider: str,
    api_key: str = None,
    model: str = "gpt-3.5-turbo",
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
    if not text:
        print("LLM Handler: Received empty text for user message.")
        return None

    # Determine the system prompt to use
    system_prompt = system_prompt_override if system_prompt_override else DEFAULT_LLM_SYSTEM_PROMPT
    if not system_prompt:
         print("Warning: LLM system prompt is empty.")
         system_prompt = " " # Use a space to avoid errors with empty system message

    if provider == "openai_api":
        if not api_key:
            print("Error: OpenAI API key is required for openai_api provider.")
            return None

        try:
            client = OpenAI(api_key=api_key)
            print(f"Sending request to OpenAI LLM API (model: {model})...")

            response = client.chat.completions.create(
                model=model,
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

    elif provider == "local_llm":
        try:
            # Get or load the model and tokenizer
            device = get_available_device()
            model, tokenizer = get_or_load_model(model, quantization, device)
            
            # Construct prompt with system and user messages
            full_prompt = f"{system_prompt}\n\nUser: {text}\nAssistant:"
            
            # Tokenize input and move to correct device
            inputs = tokenizer(full_prompt, return_tensors="pt")
            if device:
                # Properly move each tensor in the dictionary to the device
                inputs = {k: v.to(device) for k, v in inputs.items()}
            
            print(f"Generating response with {model.config._name_or_path} on {model.device}...")
            
            # Generate response
            outputs = model.generate(
                inputs["input_ids"],  # Use dictionary access instead of attribute
                max_new_tokens=max_tokens,
                temperature=temperature,
                top_p=0.95,
                do_sample=True,
                pad_token_id=tokenizer.pad_token_id
            )
            
            # Decode and return only the new tokens
            response = tokenizer.decode(outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
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
        print(f"Error: Unknown LLM provider '{provider}'")
        return None

# import configparser
# import os
# import sys
# from pathlib import Path

# # Add the src directory to the Python path
# src_path = str(Path(__file__).parent.parent)
# if src_path not in sys.path:
#     sys.path.append(src_path)

# from src.handlers.llm_handler import process_text_with_llm, get_available_device
# from llm_handler import process_text_with_llm, get_available_device

# def test_local_llm():
#     """Test the local LLM functionality with various configurations."""
#     # Load config
#     config = configparser.ConfigParser()
#     config_path = os.path.join(os.path.dirname(__file__), '..', '..', 'config.ini')
#     config.read(config_path)
    
#     # Get LLM settings from config
#     llm_config = config['LLM']
#     model = llm_config.get('local_model', 'google/gemma-7b-it')
#     quantization = llm_config.getint('quantization', 4)
    
#     # Test prompts
#     test_prompts = [
#         "Write a haiku about coding.",
#         "Explain quantum computing in one sentence.",
#         "What is the capital of France?"
#     ]
    
#     print("\nTesting local LLM...")
#     print(f"Model: {model}")
#     print(f"Quantization: {quantization}-bit")
    
#     for i, prompt in enumerate(test_prompts, 1):
#         print(f"\nTest {i}:")
#         print(f"Prompt: {prompt}\n")
        
#         try:
#             response = process_text_with_llm(
#                 text=prompt,
#                 provider='local_llm',
#                 model=model,
#                 quantization=quantization,
#                 max_tokens=100,
#                 temperature=0.7
#             )
            
#             print("Response:")
#             print("-" * 50)
#             print(response)
#             print("-" * 50)
            
#         except Exception as e:
#             print(f"Error during test: {e}")
#             import traceback
#             traceback.print_exc()

# if __name__ == "__main__":
#     test_local_llm() 
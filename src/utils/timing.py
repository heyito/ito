import time
import functools
import json
import os
from typing import List, Dict, Any

# Global list to store timing data
TIMING_DATA: List[Dict[str, Any]] = []

def time_method(func):
    """
    A decorator to measure and store the execution time of a method.
    """
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.perf_counter()
        result = func(*args, **kwargs)
        end_time = time.perf_counter()
        
        # Store timing information
        TIMING_DATA.append({
            "class_name": args[0].__class__.__name__,
            "method_name": func.__name__,
            "duration_seconds": round(end_time - start_time, 6) # Using round for cleaner output
        })
        print(f"Timing data: {TIMING_DATA}")
        # Removed the print statement
        return result
    return wrapper

def save_timing_report(filepath: str = "timing_report.json") -> None:
    """
    Saves the collected timing data to a JSON file.
    """
    # Ensure the directory exists
    os.makedirs(os.path.dirname(filepath) or '.', exist_ok=True)
    
    with open(filepath, 'w') as f:
        json.dump(TIMING_DATA, f, indent=4)
    print(f"Timing report saved to {filepath}")

def clear_timing_data() -> None:
    """
    Clears the collected timing data.
    Useful if you want to reset timings, e.g., between different runs or tests.
    """
    TIMING_DATA.clear() 
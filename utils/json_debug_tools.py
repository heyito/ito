import json
import os
from collections import Counter


def count_key_occurrences(data, target_key, counts_aggregator):
    """
    Recursively traverses the data structure (dict or list)
    and counts the occurrences of values associated with target_key.
    """
    if isinstance(data, dict):
        for key, value in data.items():
            if key == target_key:
                # We found the target key!
                # The value associated with target_key is what we categorize.
                # Ensure the value is hashable for Counter (usually strings, numbers)
                if isinstance(value, (list, dict)):
                    # If the value is complex, you might want to stringify it
                    # or decide on a specific way to categorize it.
                    # For "role", values are typically strings.
                    counts_aggregator[str(value)] += 1
                else:
                    counts_aggregator[value] += 1

            # Recursively search in the value, regardless of whether the key matched
            count_key_occurrences(value, target_key, counts_aggregator)

    elif isinstance(data, list):
        for item in data:
            # Recursively search in each item of the list
            count_key_occurrences(item, target_key, counts_aggregator)

    # If data is not a dict or list (e.g., string, int), it cannot contain keys, so we stop.


if __name__ == "__main__":
    json_file_path = "/Users/juliangomez/work/inten/context-1e1114b3-b2a6-42df-bdfc-63472cb64c3f.json"
    key_to_find = "role"  # The key you want to count occurrences for
    try:
        with open(
            json_file_path,
            "r",
        ) as f:
            loaded_json_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: File not found at {json_file_path}")
        exit()
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON from {json_file_path}")
        exit()

    # Initialize a Counter to store the categorized counts
    role_counts = Counter()

    # Start the recursive counting
    count_key_occurrences(loaded_json_data, key_to_find, role_counts)

    print(f"Occurrences of key '{key_to_find}' categorized by their values:")
    if role_counts:
        for value, count in role_counts.items():
            print(f"  - Value '{value}': {count} times")
    else:
        print(f"  No occurrences of key '{key_to_find}' found.")

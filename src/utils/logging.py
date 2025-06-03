import logging
import os
import sys
import traceback


def setup_logging():
    try:
        # Try to write to user's home directory first
        log_dir = os.path.expanduser("~/Library/Logs/Ito")
        log_file = os.path.join(log_dir, "ito.log")

        # Try to create directory and verify we can write to it
        try:
            os.makedirs(log_dir, exist_ok=True)
            # Test write access (this line will still appear from your manual write)
            with open(log_file, "a", encoding='utf-8') as f: # Added encoding
                f.write("=== Log file manually initialized by setup_logging ===\n")
        except Exception as e:
            # If we can't write to ~/Library/Logs, try /tmp
            print(f"Could not write to {log_dir}: {e}")
            log_dir = "/tmp/Ito"
            log_file = os.path.join(log_dir, "ito.log")
            os.makedirs(log_dir, exist_ok=True)
            with open(log_file, "a", encoding='utf-8') as f: # Added encoding
                f.write("=== Log file manually initialized by setup_logging (using /tmp) ===\n")

        print(
            f"Log file location: {log_file}"
        )  # Print to stderr for immediate visibility

        # --- Explicitly configure the root logger ---
        root_logger = logging.getLogger()
        root_logger.setLevel(logging.DEBUG) # Set the root logger's level

        # Clear any existing handlers from the root logger
        # This ensures that your configuration takes precedence and avoids duplicate logs
        # if setup_logging() were somehow called multiple times (though it shouldn't be).
        # It also ensures that handlers from other libraries don't interfere if they
        # were added to the root logger.
        for handler in root_logger.handlers[:]:
            handler.close() # Close the handler before removing
            root_logger.removeHandler(handler)

        # Define the format for log messages
        formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")

        # Create and add the FileHandler
        # Use 'a' for append mode so logs aren't overwritten on each start
        file_handler = logging.FileHandler(log_file, mode='a', encoding='utf-8')
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

        # Create and add the StreamHandler (for stderr)
        stream_handler = logging.StreamHandler(sys.stderr)
        stream_handler.setFormatter(formatter)
        root_logger.addHandler(stream_handler)
        
        # Optional: Log that setup is complete using the newly configured system
        logging.getLogger("setup_logging").info("Logging system configured successfully.")

    except Exception as e:
        # If logging setup fails, at least print to stderr
        print(f"Failed to setup logging: {e}")
        print(f"Error details: {traceback.format_exc()}")
        # Fall back to basic stderr logging
        # We still use basicConfig here as a last resort.
        logging.basicConfig(
            level=logging.DEBUG,
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            stream=sys.stderr,
        )
        # Get a logger specific to this fallback scenario
        fallback_logger = logging.getLogger("ai.ito.ito.logging_fallback")
        fallback_logger.error(f"Failed to setup file logging: {e}. Using stderr only.")
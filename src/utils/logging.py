import logging
import os
import sys
import traceback


def setup_logging():
  # Configure logging to write to both stderr and a file
  try:
      # Try to write to user's home directory first
      log_dir = os.path.expanduser("~/Library/Logs/Inten")
      log_file = os.path.join(log_dir, "inten.log")

      # Try to create directory and verify we can write to it
      try:
          os.makedirs(log_dir, exist_ok=True)
          # Test write access
          with open(log_file, "a") as f:
              f.write("=== Log file initialized ===\n")
      except Exception as e:
          # If we can't write to ~/Library/Logs, try /tmp
          print(f"Could not write to {log_dir}: {e}")
          log_dir = "/tmp/Inten"
          log_file = os.path.join(log_dir, "inten.log")
          os.makedirs(log_dir, exist_ok=True)
          with open(log_file, "a") as f:
              f.write("=== Log file initialized (using /tmp) ===\n")

      print(f"Log file location: {log_file}")  # Print to stderr for immediate visibility

      # Configure basic logging with both file and stderr handlers
      logging.basicConfig(
          level=logging.DEBUG,
          format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
          handlers=[
              logging.FileHandler(log_file),
              logging.StreamHandler(sys.stderr)
          ]
      )

  except Exception as e:
      # If logging setup fails, at least print to stderr
      print(f"Failed to setup logging: {e}")
      print(f"Error details: {traceback.format_exc()}")
      # Fall back to basic stderr logging
      logging.basicConfig(
          level=logging.DEBUG,
          format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
          stream=sys.stderr,
      )
      logger = logging.getLogger("ai.inten.inten.main")
      logger.error(f"Failed to setup file logging: {e}")
import logging
import os
import sys
import traceback
import datetime # For clear log message

# Global variables
LOG_FILE_PATH = None
LOG_FORMATTER = None
_initial_log_message_content = "" # Store the exact initial message written

def get_log_file_path():
    """Returns the configured log file path. Relies on setup_logging to have been called."""
    if LOG_FILE_PATH is None:
        # This is a fallback, ideally setup_logging should always be called first.
        print("Warning: get_log_file_path() called before LOG_FILE_PATH was set by setup_logging.", file=sys.stderr)
        # Fallback to default if not set, though this might not be the actual used path
        return os.path.join(os.path.expanduser("~/Library/Logs/Ito"), "ito.log")
    return LOG_FILE_PATH

def _determine_initial_message(log_file_path_used):
    """Determines the initial log message based on the path used."""
    if "/tmp/" in log_file_path_used:
        return "=== Log file manually initialized by setup_logging (using /tmp) ===\n"
    else:
        return "=== Log file manually initialized by setup_logging ===\n"

def setup_logging():
    global LOG_FILE_PATH, LOG_FORMATTER, _initial_log_message_content
    try:
        log_dir_home = os.path.expanduser("~/Library/Logs/Ito")
        log_file_home = os.path.join(log_dir_home, "ito.log")

        current_log_file = None

        try:
            os.makedirs(log_dir_home, exist_ok=True)
            _initial_log_message_content = _determine_initial_message(log_file_home)
            with open(log_file_home, "a", encoding='utf-8') as f:
                f.write(_initial_log_message_content)
            current_log_file = log_file_home
        except Exception as e:
            print(f"Could not write to {log_dir_home}: {e}", file=sys.stderr)
            log_dir_tmp = "/tmp/Ito"
            log_file_tmp = os.path.join(log_dir_tmp, "ito.log")
            os.makedirs(log_dir_tmp, exist_ok=True)
            _initial_log_message_content = _determine_initial_message(log_file_tmp)
            with open(log_file_tmp, "a", encoding='utf-8') as f:
                f.write(_initial_log_message_content)
            current_log_file = log_file_tmp

        LOG_FILE_PATH = current_log_file
        print(
            f"Log file location: {LOG_FILE_PATH}"
        )

        root_logger = logging.getLogger()
        root_logger.setLevel(logging.DEBUG)

        for handler in root_logger.handlers[:]:
            handler.close()
            root_logger.removeHandler(handler)

        LOG_FORMATTER = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")

        file_handler = logging.FileHandler(LOG_FILE_PATH, mode='a', encoding='utf-8')
        file_handler.setFormatter(LOG_FORMATTER)
        root_logger.addHandler(file_handler)

        stream_handler = logging.StreamHandler(sys.stderr)
        stream_handler.setFormatter(LOG_FORMATTER)
        root_logger.addHandler(stream_handler)
        
        logging.getLogger("setup_logging").info("Logging system configured successfully.")

    except Exception as e:
        LOG_FILE_PATH = None
        _initial_log_message_content = ""
        LOG_FORMATTER = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        print(f"Failed to setup logging: {e}")
        print(f"Error details: {traceback.format_exc()}")
        logging.basicConfig(
            level=logging.DEBUG,
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            stream=sys.stderr,
        )
        logger = logging.getLogger("ai.ito.ito.main") # Use a consistent logger name
        logger.error(f"Failed to setup file logging: {e}")


def clear_log_file_contents():
    """Clears the log file and re-initializes the file handler."""
    if LOG_FILE_PATH is None or LOG_FORMATTER is None:
        print("Error: Log file path or formatter not initialized. Cannot clear log.", file=sys.stderr)
        try:
            logging.getLogger(__name__).error("Log file path or formatter not initialized. Cannot clear log.")
        except Exception:
            pass 
        return False

    root_logger = logging.getLogger()
    original_file_handler_info = None

    for handler in root_logger.handlers[:]:
        if isinstance(handler, logging.FileHandler) and handler.baseFilename == LOG_FILE_PATH:
            original_file_handler_info = {
                "level": handler.level,
                "formatter": handler.formatter
            }
            handler.close()
            root_logger.removeHandler(handler)
            break 

    try:
        with open(LOG_FILE_PATH, 'w', encoding='utf-8') as f:
            f.write(f"=== Log file cleared at {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ===\n")
            # Re-write the original initialization message
            if _initial_log_message_content:
                 f.write(_initial_log_message_content)
            else: # Fallback if _initial_log_message_content wasn't captured
                 f.write(_determine_initial_message(LOG_FILE_PATH))


        new_file_handler = logging.FileHandler(LOG_FILE_PATH, mode='a', encoding='utf-8')
        new_file_handler.setFormatter(LOG_FORMATTER) # Use the global formatter

        if original_file_handler_info:
            new_file_handler.setLevel(original_file_handler_info["level"])
        else:
            new_file_handler.setLevel(root_logger.level if root_logger.level != logging.NOTSET else logging.DEBUG)
        
        root_logger.addHandler(new_file_handler)
        logging.getLogger(__name__).info("Log file cleared and handler re-initialized.")
        return True
    except Exception as e:
        print(f"Error clearing log file {LOG_FILE_PATH}: {e}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        # Attempt to restore a handler if possible
        if original_file_handler_info and LOG_FORMATTER:
            try:
                restored_handler = logging.FileHandler(LOG_FILE_PATH, mode='a', encoding='utf-8')
                restored_handler.setFormatter(LOG_FORMATTER) # Use global formatter
                restored_handler.setLevel(original_file_handler_info["level"])
                root_logger.addHandler(restored_handler)
                logging.getLogger(__name__).error(f"Failed to clear log, attempting to restore original file handler type. Error: {e}")
            except Exception as e_restore:
                logging.getLogger(__name__).critical(f"Failed to clear log AND failed to restore file handler. Error: {e_restore}")
        return False
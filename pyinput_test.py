import logging
import threading
import time

from pynput import keyboard

# --- Configuration ---
LOG_FILE = "pynput_minimal_debug.log"
# If no pynput event callbacks (on_press/on_release) are triggered for this many seconds,
# the activity monitor will log a warning. This can indicate an unresponsive listener.
ACTIVITY_TIMEOUT = 30  # Seconds

# --- Shared State ---
# Using a dictionary for shared state for easy access across threads
shared_data = {
    "last_event_callback_time": time.time(),
    "stop_requested_by_user": False,
    "listener_thread_supposed_to_be_running": True,
}

# --- Logging Setup ---
# Configure logging to output to both a file and the console.
# The file will be overwritten each time the script runs.
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] (%(threadName)s) %(message)s",
    handlers=[logging.FileHandler(LOG_FILE, mode="w"), logging.StreamHandler()],
)


# --- Pynput Callbacks ---
def on_press_debug(key):
    """
    Called when a key is pressed.
    Logs the event and updates the last event time.
    """
    try:
        shared_data["last_event_callback_time"] = time.time()
        logging.info(f"Key pressed: {key}")
        # print(f"Pressed: {key}") # Uncomment for quick console feedback if needed
    except Exception:
        # Catch any exception within this callback to prevent it from crashing the listener
        logging.exception("ERROR in on_press_debug callback:")


def on_release_debug(key):
    """
    Called when a key is released.
    Logs the event, updates the last event time, and checks for the Escape key to stop.
    """
    try:
        shared_data["last_event_callback_time"] = time.time()
        logging.info(f"Key released: {key}")
        # print(f"Released: {key}") # Uncomment for quick console feedback if needed

    except Exception:
        # Catch any exception within this callback
        logging.exception("ERROR in on_release_debug callback:")


# --- Monitor Thread ---
def activity_monitor_thread_func():
    """
    Runs in a separate thread to monitor if pynput event callbacks are happening.
    If no callbacks are received for ACTIVITY_TIMEOUT, it logs a warning.
    """
    logging.info("Activity monitor thread started.")

    while shared_data["listener_thread_supposed_to_be_running"]:
        # Sleep for a portion of the timeout period before checking
        # This reduces how often we check but ensures timely warnings.
        time.sleep(ACTIVITY_TIMEOUT / 2)

        # Re-check condition in case it changed during sleep
        if not shared_data["listener_thread_supposed_to_be_running"]:
            break

        current_time = time.time()
        time_since_last_callback = (
            current_time - shared_data["last_event_callback_time"]
        )

        if time_since_last_callback > ACTIVITY_TIMEOUT:
            logging.warning(
                f"No pynput event callbacks detected for over {time_since_last_callback:.0f} seconds. "
                "If keyboard activity occurred during this time but was not logged, "
                "the listener might have become unresponsive or hung."
            )
            # To avoid spamming warnings, you might add logic here to warn only once
            # per extended period of inactivity, or reset last_event_callback_time.
            # For this debug script, repeated warnings if the condition persists are acceptable.

    logging.info("Activity monitor thread stopped.")


# --- Main Execution ---
if __name__ == "__main__":
    logging.info(f"--- Pynput Minimal Debug Script ---")
    logging.info(f"Starting. Press ESC to stop. Log file: '{LOG_FILE}'")

    # Initialize shared data timestamps and flags
    shared_data["last_event_callback_time"] = time.time()
    shared_data["stop_requested_by_user"] = False
    shared_data["listener_thread_supposed_to_be_running"] = True

    # Start the activity monitor thread
    # It's a daemon thread so it won't prevent the program from exiting.
    monitor = threading.Thread(
        target=activity_monitor_thread_func, name="ActivityMonitor"
    )
    monitor.daemon = True
    monitor.start()

    pynput_listener_instance = None  # To hold the listener object
    listener_stopped_unexpectedly = False

    try:
        # The 'with' statement ensures that listener.stop() is called automatically
        # when the block is exited, for any reason (normal exit or exception).
        # listener.join() blocks the current (main) thread until the listener thread finishes.
        with keyboard.Listener(
            on_press=on_press_debug, on_release=on_release_debug
        ) as listener:
            pynput_listener_instance = listener  # Store the instance
            logging.info(
                "Pynput listener started. Main thread is now blocked by listener.join()."
            )
            listener.join()  # This line will block until the listener thread stops

        # --- This point is reached ONLY when listener.join() returns ---
        # This means the pynput listener thread has terminated.

        logging.info(
            "Pynput listener.join() has returned (listener thread terminated)."
        )

        if shared_data["stop_requested_by_user"]:
            logging.info("Listener stopped gracefully by user (ESC key).")
        else:
            # This is the key scenario we're trying to detect: listener stopped without user command.
            logging.error(
                "CRITICAL: Pynput listener stopped UNEXPECTEDLY (not by ESC key). "
                "This could indicate an internal pynput issue, an OS interference (like App Nap), "
                "or an unhandled error that propagated weirdly."
            )
            listener_stopped_unexpectedly = True
            # Check if the listener object still thinks it's alive (it shouldn't be if join returned)
            if pynput_listener_instance and pynput_listener_instance.is_alive():
                logging.error(
                    "UNEXPECTED STATE: listener.join() returned but listener.is_alive() is True. This is highly unusual."
                )

    except Exception:
        logging.exception(
            "EXCEPTION in main execution block (likely during pynput Listener setup or teardown):"
        )
        listener_stopped_unexpectedly = (
            True  # Treat any main block exception as an unexpected listener stop
        )
    finally:
        logging.info(
            "Main execution block 'try' has finished or an exception occurred."
        )
        # Ensure the monitor thread knows to stop, regardless of how we exited.
        shared_data["listener_thread_supposed_to_be_running"] = False

        logging.info("Waiting for activity monitor thread to finish...")
        monitor.join(timeout=5)  # Give the monitor thread a moment to shut down
        if monitor.is_alive():
            logging.warning(
                "Activity monitor thread did not exit cleanly within timeout."
            )

        if listener_stopped_unexpectedly:
            logging.critical(
                "The script concluded, and it appears the listener stopped unexpectedly at some point."
            )
        elif shared_data["stop_requested_by_user"]:
            logging.info(
                "The script concluded, and the listener was stopped by user request."
            )
        else:
            logging.info(
                "The script concluded (reason not explicitly an unexpected listener stop or user stop - check logs)."
            )

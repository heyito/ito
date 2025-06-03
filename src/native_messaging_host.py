#!/usr/bin/env python3

import json
import logging
import os
import platform
import socket
import struct
import sys
import threading
import time
import traceback

from src.constants import SOCKET_PATH
from src.platform_utils_macos import is_macos


def setup_logging():
    try:
        # Use /tmp directory which should be writable by Chrome's native messaging host
        log_file = "/tmp/ito_native_messaging.log"

        # Configure logging
        logging.basicConfig(
            filename=log_file,
            # pull from config.ini
            level=logging.DEBUG,
            format="%(asctime)s - %(levelname)s - %(message)s",
        )

        logging.info("Logging initialized")

    except Exception as e:
        # Fall back to stderr if file logging fails
        logging.basicConfig(
            stream=sys.stderr,
            level=logging.INFO,
            format="%(asctime)s - %(levelname)s - %(message)s",
        )
        logging.error(f"Failed to setup file logging: {e}")


class NativeHost:
    def __init__(self):
        self.local_server = None
        self.connections = set()

    def setup_local_server(self):
        # Remove existing socket if it exists
        if os.path.exists(SOCKET_PATH):
            try:
                os.remove(SOCKET_PATH)
            except Exception as e:
                logging.error(f"Error removing existing socket: {e}")

        self.local_server = socket.socket(socket.AF_UNIX)
        self.local_server.bind(SOCKET_PATH)
        self.local_server.listen(1)
        logging.info(f"Local server listening on {SOCKET_PATH}")

        # Start thread to accept connections from main.py
        threading.Thread(target=self.accept_connections, daemon=True).start()

    def accept_connections(self):
        while True:
            try:
                conn, _ = self.local_server.accept()
                self.connections.add(conn)
                threading.Thread(
                    target=self.handle_local_connection, args=(conn,), daemon=True
                ).start()
                logging.info("New connection accepted from main.py")
            except Exception as e:
                logging.error(f"Error accepting connection: {e}")
                time.sleep(1)

    def handle_local_connection(self, conn):
        try:
            while True:
                data = conn.recv(4096)
                if not data:
                    break

                try:
                    message = json.loads(data.decode())
                    logging.info(f"Received message from main.py: {message}")

                    # Forward message to Chrome with appropriate type conversion
                    if message.get("type") == "insert_text":
                        chrome_message = {
                            "type": "insert_text",
                            "text": message.get("text", ""),
                        }
                        self.send_to_chrome(chrome_message)
                    elif message.get("type") == "ping":
                        # Forward ping from socket to Chrome
                        self.send_to_chrome({"type": "ping"})
                    elif message.get("type") == "pong":
                        # Forward pong from socket to Chrome
                        self.send_to_chrome({"type": "pong"})
                    else:
                        self.send_to_chrome(message)
                except json.JSONDecodeError as e:
                    logging.error(f"Invalid JSON received: {e}")
                except Exception as e:
                    logging.error(f"Error handling message: {e}")

        except Exception as e:
            logging.error(f"Error in connection handler: {e}")
        finally:
            self.connections.remove(conn)
            conn.close()

    def send_to_chrome(self, message):
        """Forward message to Chrome and return the response."""
        logging.info(f"Forwarding message to Chrome: {message}")
        write_message(message)

    def handle_chrome_message(self, message):
        """Handle messages received from Chrome."""
        logging.info(f"Received message from Chrome: {message}")

        # Forward message to all connected sockets
        if message.get("type") == "insert_text_ack":
            for conn in self.connections:
                try:
                    conn.send(json.dumps(message).encode())
                    logging.info("Forwarded insert_text_ack to socket connection")
                except Exception as e:
                    logging.error(f"Error forwarding insert_text_ack to socket: {e}")
        elif message.get("type") == "ping":
            # Forward ping from Chrome to all sockets
            for conn in self.connections:
                try:
                    conn.send(json.dumps({"type": "ping"}).encode())
                    logging.info("Forwarded ping to socket connection")
                except Exception as e:
                    logging.error(f"Error forwarding ping to socket: {e}")
        elif message.get("type") == "pong":
            # Forward pong from Chrome to all sockets
            for conn in self.connections:
                try:
                    conn.send(json.dumps({"type": "pong"}).encode())
                    logging.info("Forwarded pong to socket connection")
                except Exception as e:
                    logging.error(f"Error forwarding pong to socket: {e}")
        else:
            for conn in self.connections:
                try:
                    conn.send(json.dumps(message).encode())
                    logging.info("Forwarded Chrome message to socket connection")
                except Exception as e:
                    logging.error(f"Error forwarding message to socket: {e}")

    def start(self):
        self.setup_local_server()
        logging.info("Native host started with local server")


def read_message():
    """Read a message from stdin according to Chrome native messaging protocol."""
    try:
        # Read the message length (first 4 bytes)
        raw_length = sys.stdin.buffer.read(4)
        if not raw_length:
            return None

        # Unpack length as native-endian unsigned int
        length = struct.unpack_from("=I", raw_length)[0]
        logging.debug(f"Message length: {length}")

        # Chrome native messaging protocol has a 1MB message size limit
        # This prevents memory exhaustion from malicious or malformed messages
        if length > 1024 * 1024:
            logging.error(f"Invalid message length received: {length}")
            # Try to recover by reading one byte at a time until we find a valid message
            buffer = bytearray()
            while True:
                byte = sys.stdin.buffer.read(1)
                if not byte:
                    break
                buffer.extend(byte)
                try:
                    # Try to parse as JSON
                    message = buffer.decode("utf-8")
                    if message.startswith("{") and message.endswith("}"):
                        data = json.loads(message)
                        logging.info(f"Recovered message after length error: {data}")
                        return data
                except (UnicodeDecodeError, json.JSONDecodeError):
                    continue
            return None

        # Read the message of exactly specified length
        message = sys.stdin.buffer.read(length).decode("utf-8")
        logging.debug(f"Raw message received: {message}")

        # Verify message starts with { and ends with }
        if not (message.startswith("{") and message.endswith("}")):
            logging.error(
                f"Malformed message received, doesn't look like JSON: {message[:100]}..."
            )
            return None

        # Parse JSON
        data = json.loads(message)
        logging.info(f"Received message: {data}")
        return data

    except struct.error as e:
        logging.error(f"Error reading message length: {e}")
        return None
    except json.JSONDecodeError as e:
        logging.error(f"Error reading message: {e}")
        return None
    except Exception as e:
        logging.error(f"Unexpected error reading message: {e}")
        logging.error(traceback.format_exc())
        return None


def write_message(message):
    """Write a message to stdout according to Chrome native messaging protocol."""
    try:
        # Convert message to JSON and encode as UTF-8
        encoded_message = json.dumps(message).encode("utf-8")

        # Write message length as 32-bit unsigned integer
        sys.stdout.buffer.write(struct.pack("=I", len(encoded_message)))
        # Write the message itself
        sys.stdout.buffer.write(encoded_message)
        sys.stdout.buffer.flush()

        logging.debug(f"Message sent: {message}")

    except Exception as e:
        logging.error(f"Error writing message: {e}")
        logging.error(traceback.format_exc())


def main():
    setup_logging()
    logging.info("Native messaging host started")
    logging.info(f"Python version: {sys.version}")
    logging.info(f"Platform: {platform.platform()}")
    logging.info(f"Current directory: {os.getcwd()}")
    logging.info(f"Script path: {os.path.abspath(__file__)}")
    logging.info(f"Command line arguments: {sys.argv}")
    logging.info(f"Environment variables: {os.environ}")

    if not is_macos():
        logging.error("This native messaging host is only supported on macOS")
        sys.exit(1)

    # Set stdin/stdout to binary mode
    if sys.platform == "win32":
        import msvcrt

        # Windows requires binary mode for native messaging protocol
        # This prevents line ending conversion and ensures proper message framing
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)

    try:
        # Initialize and start the native host
        native_host = NativeHost()
        native_host.start()

        # Send startup message
        write_message(
            {
                "type": "startup",
                "status": "ready",
                "python_version": sys.version,
                "platform": platform.platform(),
            }
        )
        logging.info("Native messaging host is ready")

        # Main message loop
        while True:
            try:
                message = read_message()
                if message:
                    if message.get("type") == "ping":
                        write_message({"type": "pong"})
                    elif message.get("type") == "test":
                        write_message({"type": "test_response", "received": message})
                    else:
                        # Forward all other messages to socket connections
                        native_host.handle_chrome_message(message)
                else:
                    # If no message is received, wait a bit before trying again
                    time.sleep(0.2)
            except Exception as e:
                logging.error(f"Error in message loop: {e}")
                logging.error(traceback.format_exc())
                time.sleep(1)  # Wait a bit before retrying

    except KeyboardInterrupt:
        logging.info("Native messaging host shutting down...")
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        logging.error(traceback.format_exc())
        raise


if __name__ == "__main__":
    main()

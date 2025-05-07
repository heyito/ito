# src/discrete_application_runner.py
import queue
import threading
import time
import traceback
from typing import Optional, Dict, Any

import numpy as np

from src.app_config import AppConfig
from src.application_interface import ApplicationInterface
from src.context_manager import ContextManager
from src.command_processor import CommandProcessor
from src.handlers.audio.audio_recorder import AudioRecorder
from src.handlers.asr_handler_interface import ASRHandlerInterface
from src.types.status_messages import StatusMessage


class DiscreteApplicationRunner(ApplicationInterface):
    """Orchestrates the discrete command workflow using composed components."""

    def __init__(self,
                 config: AppConfig, # Use AppConfig directly
                 context_manager: ContextManager,
                 command_processor: CommandProcessor,
                 audio_recorder: AudioRecorder,
                 asr_handler: ASRHandlerInterface,
                 status_queue: Optional[queue.Queue]):

        self.config = config
        self.context_manager = context_manager
        self.command_processor = command_processor
        self.audio_recorder = audio_recorder
        self.asr_handler = asr_handler
        self.status_queue = status_queue # Attached by ApplicationManager

        self._action_queue = queue.Queue()
        self._stop_event = threading.Event()
        self._monitor_thread: Optional[threading.Thread] = None # Monitor coordination thread

        self._print_initial_info()

    def _print_initial_info(self):
        timestamp = time.strftime('%Y-%m-%d %H:%M:%S')
        print(f"\n--- Inten Tool (Discrete Command Mode) ---")
        print(f"Timestamp: {timestamp}")
        # Add platform warning if needed
        print(f"ASR Source: {self.config.asr_source} ({self.config.asr_model or self.config.asr_local_model_size})")
        print(f"VAD Enabled: {self.config.vad_enabled}")
        if self.config.vad_enabled:
             print(f"  Stops after {self.config.silence_duration_ms}ms silence.")
        print(f"\nPress '{self.config.start_recording_hotkey}' to issue command.")
        print("Inten background process running...")


    def trigger_interaction(self) -> None:
        """Queues the start action if preconditions met."""
        timestamp = time.strftime('%H:%M:%S')
        if self.command_processor.is_processing:
            print(f"[{timestamp}] Trigger ignored: Command processor busy.")
            self._update_status(StatusMessage.PROCESSING_BUSY)
            return
        if self.audio_recorder.is_recording:
            print(f"[{timestamp}] Trigger ignored: Already recording.")
            self._update_status(StatusMessage.ALREADY_RECORDING)
            return

        print(f"[{timestamp}] Trigger received. Queuing start action.")
        self._action_queue.put("START")
        self._update_status(StatusMessage.HOTKEY_PRESSED)

    def run(self) -> None:
        """Main event loop processing actions."""
        print("Discrete Runner: Starting event loop...")
        while not self._stop_event.is_set():
            try:
                action = self._action_queue.get(timeout=0.5)
                if action == "START":
                    self._handle_start_recording()
            except queue.Empty:
                continue # Check stop event
            except Exception as e:
                print(f"Discrete Runner Error: {e}")
                traceback.print_exc()
        print("Discrete Runner: Event loop stopped.")

    def _handle_start_recording(self):
        """Initiates context fetch and audio recording."""
        timestamp = time.strftime('%H:%M:%S')
        print(f"[{timestamp}] Discrete Runner: Handling start action...")

        # Start context fetch (non-blocking)
        self.context_manager.fetch_context_async()

        # Start audio recording (non-blocking), provide callback
        if not self.audio_recorder.start_recording(self._process_recorded_audio):
             print(f"[{timestamp}] Discrete Runner: Failed to start audio recorder.")
             # Reset state? AudioRecorder might already be recording from previous failed trigger.

    def _process_recorded_audio(self, audio_buffer: Optional[bytes]):
        """
        Callback function passed to AudioRecorder.
        Executed by AudioRecorder's monitor thread.
        Handles transcription, context waiting, and command processing.
        """
        timestamp = time.strftime('%H:%M:%S')
        print(f"[{timestamp}] Discrete Runner: Received audio buffer from recorder.")

        if not audio_buffer:
            print(f"[{timestamp}] Discrete Runner: No audio buffer received. Aborting.")
            # Status updated by AudioRecorder
            return

        # --- Transcribe ---
        print(f"[{timestamp}] Discrete Runner: Transcribing...")
        self._update_status(StatusMessage.TRANSCRIBING)
        user_command: Optional[str] = None
        try:
            user_command = self.asr_handler.transcribe_audio(audio_buffer)
            if not user_command or not user_command.strip():
                print(f"[{timestamp}] Discrete Runner: Transcription empty.")
                self._update_status(StatusMessage.READY_EMPTY)
                return
            print(f"[{timestamp}] Discrete Runner: Transcribed: '{user_command}'")
            self._update_status(StatusMessage.TRANSCRIBED.format(text=user_command[:40]))
        except Exception as e:
            print(f"[{timestamp}] Discrete Runner: ASR Error: {e}")
            traceback.print_exc()
            self._update_status(StatusMessage.ASR_ERROR.format(error=str(e)))
            return

        # --- Wait for Context ---
        print(f"[{timestamp}] Discrete Runner: Waiting for context...")
        context_doc_text = self.context_manager.wait_for_context(timeout=5.0)
        # Get the full context dict (app_name + doc_text)
        current_context_data = self.context_manager.get_current_context()
        print(f"[{timestamp}] Discrete Runner: Context ready (App: {current_context_data.get('app_name')}).")

        # --- Process Command ---
        print(f"[{timestamp}] Discrete Runner: Initiating command processing...")
        # CommandProcessor handles the processing lock and thread internally
        self.command_processor.process_command(current_context_data, user_command)
        
        # Add a 500ms delay before returning to READY state
        time.sleep(0.5)
        # Return to READY state after transcription and command processing is initiated
        self._update_status(StatusMessage.READY)

    def _update_status(self, status: StatusMessage | str):
        """Update status, handling both enum values and custom messages."""
        if self.status_queue:
            try:
                if isinstance(status, StatusMessage):
                    # If it's a StatusMessage enum, use its value directly
                    self.status_queue.put_nowait(status.value)
                else:
                    # Try to match custom message to enum
                    matched_status = StatusMessage.from_custom_message(status)
                    if matched_status:
                        # If we found a match, use the formatted message
                        self.status_queue.put_nowait(status)
                    else:
                        # If no match, use the message as is
                        self.status_queue.put_nowait(status)
            except Exception:
                pass

    def cleanup(self) -> None:
        """Cleans up all composed components."""
        print("Discrete Runner: Cleaning up...")
        self._stop_event.set() # Signal event loop

        # Cleanup components in reasonable order
        self.audio_recorder.cleanup()
        self.command_processor.cleanup()
        self.context_manager.cleanup()

        # Clear action queue
        while not self._action_queue.empty():
             try: self._action_queue.get_nowait()
             except queue.Empty: break

        print("Discrete Runner: Cleanup finished.")
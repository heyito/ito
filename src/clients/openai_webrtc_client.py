import asyncio
import json
import logging
import ssl
import time
from collections.abc import Callable
from fractions import Fraction

import aiohttp
import numpy as np
from aiortc import AudioStreamTrack as AIORTCAudioStreamTrack
from aiortc import (
    RTCDataChannel,
    RTCPeerConnection,
    RTCSessionDescription,
)
from aiortc.mediastreams import AudioFrame, MediaStreamError  # Added AudioFrame

# Configure logging for aiortc and our client
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("OpenAIWebRTCClient")

AUDIO_PTIME = 0.020  # Packetization time (20ms) -> Default for aiortc AudioFrame


class AudioInputTrack(
    AIORTCAudioStreamTrack
):  # Renamed to avoid conflict with aiortc's AudioStreamTrack
    """
    A custom aiortc AudioStreamTrack that reads audio chunks from an asyncio Queue.
    """

    kind = "audio"

    def __init__(self, audio_queue: asyncio.Queue, sample_rate: int, channels: int):
        super().__init__()  # Call the parent constructor
        self._queue = audio_queue
        self._sample_rate = sample_rate
        self._channels = channels
        # Samples per frame expected by aiortc based on standard PTIME
        self._samples_per_frame = int(self._sample_rate * AUDIO_PTIME)
        self._start_time = time.time()
        self._input_buffer = bytearray()  # Buffer for assembling full frames
        self._bytes_per_sample = 2  # Assuming int16 (PCM16)
        self._bytes_per_frame = (
            self._samples_per_frame * self._channels * self._bytes_per_sample
        )
        self._last_frame_time = None
        logger.info(
            f"AudioInputTrack initialized: Rate={sample_rate}, Channels={channels}, Samples/Frame={self._samples_per_frame}, Bytes/Frame={self._bytes_per_frame}"
        )

    async def recv(self) -> AudioFrame:
        """
        Pulls data from the queue, buffers it, and returns AudioFrame objects.
        """
        recv_start_time = time.monotonic()
        # logger.debug(f"[{recv_start_time:.3f}] recv called.")

        if self._last_frame_time is None:
            self._last_frame_time = time.monotonic()

        buffer_fill_start_time = time.monotonic()
        while len(self._input_buffer) < self._bytes_per_frame:
            chunk = await self._queue.get()
            if chunk is None:
                logger.info(
                    "Received None (EOS signal) from audio queue. Stopping track."
                )
                # Signal the end of the stream according to aiortc docs
                # await self.stop() # This might be called automatically? Check aiortc behavior
                raise MediaStreamError("Audio stream ended")

            # Ensure chunk is bytes (int16 format expected)
            if isinstance(chunk, np.ndarray):
                if chunk.dtype == np.int16:
                    self._input_buffer.extend(chunk.tobytes())
                else:
                    # Attempt conversion if not int16 (e.g., float32)
                    # This assumes float is in range [-1.0, 1.0]
                    if np.issubdtype(chunk.dtype, np.floating):
                        chunk_int16 = (chunk * 32767).astype(np.int16)
                        self._input_buffer.extend(chunk_int16.tobytes())
                    else:
                        logger.warning(
                            f"Received unexpected numpy array dtype: {chunk.dtype}. Attempting astype(np.int16)."
                        )
                        chunk_int16 = chunk.astype(np.int16)
                        self._input_buffer.extend(chunk_int16.tobytes())
            elif isinstance(chunk, bytes):
                self._input_buffer.extend(chunk)
            else:
                logger.warning(
                    f"Received unexpected data type from queue: {type(chunk)}"
                )

            self._queue.task_done()  # Mark item as processed

        # Extract one frame's worth of data
        frame_data = self._input_buffer[: self._bytes_per_frame]
        del self._input_buffer[: self._bytes_per_frame]

        # Calculate presentation time
        # Use monotonic clock for intervals, add to start time for absolute PTS
        now = time.monotonic()
        self._last_frame_time = now

        # Create AudioFrame specifying format, layout, and number of samples
        new_frame = AudioFrame(
            format="s16",  # Assuming int16 format
            layout="mono"
            if self._channels == 1
            else "stereo",  # Set layout based on channels
            samples=self._samples_per_frame,  # Number of samples per channel
        )

        # Copy the frame data into the frame's buffer (plane 0 for mono/interleaved)
        new_frame.planes[0].update(frame_data)

        # Set other properties
        new_frame.sample_rate = self._sample_rate
        new_frame.time_base = Fraction(
            1, self._sample_rate
        )  # Use sample rate for time base
        # Manually set pts based on monotonic time (more robust)
        new_frame.pts = int(
            (now - self._start_time) / new_frame.time_base
        )  # Calculate PTS based on elapsed monotonic time

        recv_end_time = time.monotonic()
        logger.debug(
            f"[{(recv_end_time):.3f}] recv finished in {(recv_end_time - recv_start_time) * 1000:.2f} ms. Frame PTS: {new_frame.pts}"
        )

        return new_frame

    # Optional: Implement stop() if specific cleanup is needed when track stops
    # async def stop(self):
    #    logger.info("AudioInputTrack stop() called.")
    #    await super().stop() # Call parent stop


class OpenAIWebRTCClient:
    """
    Client to manage a WebRTC connection with OpenAI's real-time transcription API.
    """

    def __init__(
        self,
        api_key: str,
        on_transcription_received: Callable[[dict], None] | None = None,
        model: str = "gpt-4o-mini-transcribe",
    ):
        """
        Initializes the client.

        Args:
            api_key: The OpenAI API key.
            on_transcription_received: Optional async callback function to handle incoming transcript messages.
                                       It will be called with the JSON data received.
        """
        if not api_key:
            raise ValueError("OpenAI API key is required.")

        self.api_key = api_key
        self.model = model
        # --- Updated URL based on search results ---
        self.session_url = (
            "https://api.openai.com/v1/realtime"  # Use the base realtime endpoint
        )
        self.pc = RTCPeerConnection()
        self.audio_track: AudioInputTrack | None = (
            None  # This will hold the AudioInputTrack instance
        )
        self._session: aiohttp.ClientSession | None = None
        self._connection_task: asyncio.Task | None = None
        self._audio_queue: asyncio.Queue | None = None
        self._sample_rate: int | None = None
        self._channels: int | None = None
        self._on_transcription_received = on_transcription_received  # Store callback
        self._datachannel: RTCDataChannel | None = (
            None  # Added for receiving transcripts
        )

        # --- Setup Event Handlers ---
        @self.pc.on("connectionstatechange")
        async def on_connectionstatechange():
            logger.info(f"Connection state is {self.pc.connectionState}")
            if self.pc.connectionState == "failed":
                await self.close()  # Clean up on failure

    async def _get_session(self) -> aiohttp.ClientSession:
        """Creates or returns an existing aiohttp ClientSession."""
        if self._session is None or self._session.closed:
            logger.info("Creating new aiohttp ClientSession")
            # Consider configuring connector/timeout settings as needed
            timeout = aiohttp.ClientTimeout(total=30)  # Example: 30 second timeout
            self._session = aiohttp.ClientSession(timeout=timeout)
        return self._session

    async def connect(
        self, audio_queue: asyncio.Queue, sample_rate: int, channels: int
    ):
        """
        Establishes the WebRTC connection with OpenAI.

        Args:
            audio_queue: The asyncio queue containing audio chunks (np.ndarray or bytes).
            sample_rate: The sample rate of the audio (e.g., 16000).
            channels: The number of audio channels (e.g., 1).
        """
        if self.pc.connectionState == "connected":
            logger.warning("Already connected.")
            return

        if self._connection_task and not self._connection_task.done():
            logger.warning("Connection attempt already in progress.")
            return

        # Store audio source details
        self._audio_queue = audio_queue
        self._sample_rate = sample_rate
        self._channels = channels
        if not self._audio_queue or not self._sample_rate or not self._channels:
            logger.error(
                "Audio queue, sample rate, and channels must be provided for connect."
            )
            raise ValueError(
                "Audio queue, sample rate, and channels must be provided for connect."
            )

        logger.info("Starting WebRTC connection establishment...")
        self._connection_task = asyncio.create_task(self._establish_connection())
        try:
            await self._connection_task
        except asyncio.CancelledError:
            logger.info("Connection task cancelled.")
        except Exception as e:
            logger.error(f"Connection failed: {e}")
            await self.close()  # Ensure cleanup on error
            raise  # Re-raise the exception
        finally:
            self._connection_task = None
            logger.info(
                f"Connection attempt finished. State: {self.pc.connectionState}"
            )

    async def _establish_connection(self):
        """Internal method to handle WebRTC negotiation."""
        if not self._audio_queue or not self._sample_rate or not self._channels:
            logger.error(
                "Audio source details missing during connection establishment."
            )
            raise ConnectionError("Audio source not configured before connection.")

        # 1. Create and add the custom audio track
        self.audio_track = AudioInputTrack(
            self._audio_queue, self._sample_rate, self._channels
        )
        self.pc.addTrack(self.audio_track)
        logger.info(
            f"Added AudioInputTrack (Rate: {self._sample_rate}, Channels: {self._channels})."
        )

        # 2. Create Data Channel *before* creating the offer
        # Use the label "oai-events" as seen in OpenAI JS examples.
        logger.info("Creating data channel 'oai-events' locally...")
        self._datachannel = self.pc.createDataChannel("oai-events")
        logger.info(f"Data channel '{self._datachannel.label}' created locally.")

        # --- Setup handlers directly on the created channel ---
        @self._datachannel.on("open")
        def on_open():
            config_message = {
                "type": "session.update",  # Use type from JS example
                "session": {
                    "input_audio_format": "pcm16",  # Our format
                    "input_audio_transcription": {
                        # Use a model explicitly supported for transcription
                        "model": self.model
                    },
                    "turn_detection": {"type": "semantic_vad", "eagerness": "high"},
                },
            }
            try:
                self._datachannel.send(json.dumps(config_message))
                logger.info("Sent session update for transcription.")
            except Exception as e:
                logger.error(f"Error sending session update message: {e}")

        @self._datachannel.on("close")
        def on_close():
            logger.info("Data channel closed.")

        @self._datachannel.on("message")
        async def on_message(message: str):
            try:
                data = json.loads(message)
                event_type = data.get("type")

                transcript_text = None
                # Check for transcription events based on documentation
                if event_type == "conversation.item.input_audio_transcription.delta":
                    logger.debug(f"delta received: {data.get('delta')}")
                elif (
                    event_type
                    == "conversation.item.input_audio_transcription.completed"
                ):
                    transcript_text = data.get("transcript")
                # Add handling for other event types if needed later
                # else:
                #     logger.debug(f"Received unhandled event type: {event_type}")

                # If we got transcript text and have a callback, call it
                if transcript_text and self._on_transcription_received:
                    # Create a simple dict for the callback, similar to previous structure
                    callback_data = {"text": transcript_text}
                    if asyncio.iscoroutinefunction(self._on_transcription_received):
                        asyncio.create_task(
                            self._on_transcription_received(callback_data)
                        )
                    else:
                        self._on_transcription_received(callback_data)

            except json.JSONDecodeError:
                logger.error(f"Received non-JSON message: {message}")
            except Exception as e:
                logger.error(f"Error processing message from data channel: {e}")

        # 3. Create offer
        offer = await self.pc.createOffer()
        await self.pc.setLocalDescription(offer)
        logger.info(
            "Created and set local SDP offer (including data channel 'oai-events')."
        )
        # logger.debug(f"Local Offer SDP: {offer.sdp}") # Debug

        # 4. Send offer to OpenAI API
        session = await self._get_session()

        # --- Revert to sending SDP Offer Text ---
        request_body = self.pc.localDescription.sdp
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/sdp",  # Use SDP content type
        }
        target_url = f"{self.session_url}?model=gpt-4o-realtime-preview-2024-12-17"

        logger.info(f"Sending offer SDP to {target_url}...")

        try:
            # Send SDP text
            async with session.post(
                target_url, data=request_body, headers=headers, ssl=ssl.SSLContext()
            ) as response:
                logger.info(f"Received response status: {response.status}")
                response_text = (
                    await response.text()
                )  # Read text for debugging/error cases
                if response.status >= 400:
                    logger.error(f"Error Response Text: {response_text}")
                response.raise_for_status()  # Raise HTTPError for bad responses (4xx or 5xx)

                # --- Expect SDP Answer Text, NOT JSON ---
                logger.info(
                    "Received successful SDP answer response from session endpoint."
                )

                # 5. Set remote description (answer)
                # --- Create RTCSessionDescription from the response text ---
                answer_sdp = response_text
                answer = RTCSessionDescription(sdp=answer_sdp, type="answer")
                await self.pc.setRemoteDescription(answer)
                logger.info("Set remote SDP answer.")
                # logger.debug(f"Remote Answer SDP: {answer.sdp}")

                # 6. Add ICE candidates (if provided in the answer)
                # Assuming aiortc handles candidates included in the answer SDP
                logger.info(
                    "ICE candidates should be handled automatically by aiortc from SDP answer."
                )

            # If the code reaches here without raising an exception, the offer/answer was successful.
            logger.info("Waiting for connection to establish...")
            # Wait for connection state to become 'connected'
            # Add a timeout to prevent indefinite waiting
            try:
                await asyncio.wait_for(
                    self._wait_for_connection(), timeout=20.0
                )  # 20 second timeout
                logger.info("WebRTC connection established successfully!")
            except TimeoutError:
                logger.error("Timeout waiting for WebRTC connection to establish.")
                raise ConnectionError("WebRTC connection timed out")

        except aiohttp.ClientResponseError as e:
            logger.error(
                f"HTTP Error during session negotiation: {e.status} {e.message}"
            )
            logger.error(
                f"Response text was: {await response.text()}"
            )  # Log response text on error
            raise  # Re-raise specific HTTP error
        except aiohttp.ClientError as e:
            logger.error(f"aiohttp Client Error during session negotiation: {e}")
            raise  # Re-raise general client error
        except Exception as e:
            logger.error(
                f"Unexpected error during WebRTC connection: {e}", exc_info=True
            )  # Log traceback
            raise  # Re-raise other errors

    async def _wait_for_connection(self):
        """Waits until the PeerConnection state is 'connected'."""
        while self.pc.connectionState != "connected":
            if self.pc.connectionState in ["failed", "closed", "disconnected"]:
                logger.error(
                    f"Connection entered failed/closed state while waiting: {self.pc.connectionState}"
                )
                raise ConnectionError(
                    f"WebRTC connection failed. State: {self.pc.connectionState}"
                )
            await asyncio.sleep(0.5)  # Check every 500ms

    async def close(self):
        """
        Closes the WebRTC connection and releases resources.
        """
        logger.info("Closing WebRTC connection...")

        # Signal the audio track to stop by putting None in the queue
        # This needs to be done from the same loop the queue is used in
        if self._audio_queue:
            logger.debug("Attempting to signal AudioInputTrack to stop...")
            try:
                # No need for call_soon_threadsafe if close() is awaited in the asyncio loop
                await self._audio_queue.put(None)
                logger.debug("Signaled AudioInputTrack with None.")
            except Exception as e:
                logger.error(f"Error putting None into audio queue during close: {e}")

        # Stop the track explicitly (might help cleanup)
        # --- Added check before awaiting stop ---
        if self.audio_track and hasattr(self.audio_track, "stop"):
            logger.debug("Calling audio_track.stop()")
            try:
                self.audio_track.stop()
            except Exception as e:
                logger.error(f"Error calling audio_track.stop(): {e}")
        else:
            logger.debug(
                "Audio track is None or has no stop method, skipping stop call."
            )

        # Close the PeerConnection
        if self.pc and self.pc.connectionState != "closed":
            logger.debug("Closing PeerConnection.")
            await self.pc.close()
            logger.info("PeerConnection closed.")

        # Close the aiohttp session
        if self._session and not self._session.closed:
            logger.debug("Closing aiohttp session.")
            await self._session.close()
            self._session = None
            logger.info("aiohttp session closed.")

        # Cancel the connection task if it's running
        if self._connection_task and not self._connection_task.done():
            logger.debug("Cancelling ongoing connection task.")
            self._connection_task.cancel()
            try:
                await self._connection_task  # Wait for cancellation to complete
            except asyncio.CancelledError:
                logger.info("Connection task successfully cancelled.")
            except Exception as e:
                logger.error(f"Error while awaiting cancelled connection task: {e}")
            self._connection_task = None

        logger.info("WebRTC client cleanup complete.")

    # --- Placeholder for sending data (if needed) ---
    # async def send_data(self, message: str):
    #     if self._datachannel and self._datachannel.readyState == "open":
    #         self._datachannel.send(message)
    #         logger.debug(f"Sent message via data channel: {message}")
    #     else:
    #         logger.warning("Cannot send data: Data channel not open or not available.")

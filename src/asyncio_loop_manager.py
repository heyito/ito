import asyncio
import threading


class AsyncioLoopManager:
    def __init__(self):
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._stop_event = threading.Event()

    def get_loop(self) -> asyncio.AbstractEventLoop:
        with self._lock:
            if self._loop is None or not self._loop.is_running():
                print("AsyncioLoopManager: Starting loop...")
                self._stop_event.clear()
                start_event = threading.Event()
                self._thread = threading.Thread(
                    target=self._run_loop, args=(start_event,), daemon=True
                )
                self._thread.start()
                if not start_event.wait(timeout=3.0):
                    raise RuntimeError("Asyncio loop failed to start")
                print("AsyncioLoopManager: Loop started.")
            if self._loop is None:  # Check again after wait
                raise RuntimeError("Asyncio loop is None after start attempt")
            return self._loop

    def _run_loop(self, start_event: threading.Event):
        try:
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
            start_event.set()  # Signal loop object is ready
            # Run until explicitly stopped
            while not self._stop_event.is_set():
                self._loop.run_until_complete(asyncio.sleep(0.1))  # Keep running
            # Perform final cleanup if needed before closing
            print("AsyncioLoopManager: Running final loop tasks before close...")
            self._loop.run_until_complete(self._loop.shutdown_asyncgens())
            print("AsyncioLoopManager: Closing loop...")
            self._loop.close()
        except Exception as e:
            print(f"AsyncioLoopManager: Error in loop thread: {e}")
        finally:
            print("AsyncioLoopManager: Loop thread finished.")
            with self._lock:  # Ensure setting loop to None is safe
                self._loop = None

    def stop_loop(self):
        thread_to_join = None  # Initialize here
        with self._lock:
            if self._thread and self._thread.is_alive():
                print("AsyncioLoopManager: Stopping loop...")
                self._stop_event.set()  # Signal run_until_complete loop to exit
                if self._loop and self._loop.is_running():
                    # Request stop for run_forever if it was used instead
                    self._loop.call_soon_threadsafe(self._loop.stop)

                thread_to_join = self._thread  # Copy handle

        # Join outside lock
        if thread_to_join:
            thread_to_join.join(timeout=3.0)
            if thread_to_join.is_alive():
                print("Warning: Asyncio loop thread did not stop cleanly.")
        print("AsyncioLoopManager: Loop stop sequence finished.")

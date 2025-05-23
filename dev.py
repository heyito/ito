#!/usr/bin/env python3
import os
import signal
import subprocess
import sys
import time

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer


class RestartHandler(FileSystemEventHandler):
    def __init__(self):
        self.process = None
        self.start_process()

    def start_process(self):
        if self.process:
            # Kill the existing process
            try:
                os.killpg(os.getpgid(self.process.pid), signal.SIGTERM)
                self.process.wait()
            except ProcessLookupError:
                # Process might have already terminated
                pass

        # Start a new process
        try:
            env = os.environ.copy()
            env["DEV"] = "true"
            self.process = subprocess.Popen(
                [sys.executable, "-m", "src.main"],
                env=env,
                preexec_fn=os.setsid,
            )
            print("\n🔄 Started application")
        except Exception as e:
            print(f"\n❌ Error starting application: {str(e)}")
            self.process = None

    def on_modified(self, event):
        if event.src_path.endswith(".py"):
            print(f"\n📝 Detected change in {event.src_path}")
            self.start_process()


def main():
    print("🚀 Starting development server with hot reload...")
    print("📂 Watching for changes in src directory...")

    handler = RestartHandler()
    observer = Observer()
    observer.schedule(handler, path="src", recursive=True)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        if handler.process:
            try:
                os.killpg(os.getpgid(handler.process.pid), signal.SIGTERM)
            except ProcessLookupError:
                pass
    observer.join()


if __name__ == "__main__":
    main()

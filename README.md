# Inten Tool

This tool listens for voice input via a hotkey, transcribes the speech, processes the transcription with an LLM to understand the user's _intent_, and then types the refined output at the current cursor location.

## Features

- **Hotkey Activated:** Press a configurable hotkey to start recording, press again to stop and process.
- **Speech Recognition:** Transcribes spoken audio using selected ASR source (initially OpenAI Whisper API).
- **Intent Processing:** Uses an LLM (initially OpenAI GPT API) to refine the raw transcription into intended written text (e.g., correcting grammar, removing filler words, formatting).
- **Automatic Typing:** Simulates keyboard input to type the final text into any application.

## Prerequisites

- Python 3.8+
- PortAudio (system dependency for `sounddevice`)
  - **macOS:** `brew install portaudio`
  - **Debian/Ubuntu:** `sudo apt-get install libportaudio2 libportaudiocpp0 portaudio19-dev`
  - **Windows:** Often included with Python distributions, or installers available online.
- An OpenAI API Key (for initial ASR and LLM sources)

## Setup

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/demox-labs/inten.git
    cd inten
    ```

1.  **Install poetry (for dependency management):**

    ```bash
    curl -sSL https://install.python-poetry.org | python3 -

    poetry config virtualenvs.in-project true
    export PATH="$HOME/.local/bin:$PATH"
    ```

1.  **First time setup**

    ```bash
    make setup
    ```

    This runs a config setting for poetry so that `.venv` is created in the project rather than in OS root

1.  **Activate virtual environment**

    ```bash
    # Windows
    .venv\Scripts\activate
    # macOS/Linux
    source .venv/bin/activate
    ```

1.  **Build the swift binary**

    - Will require some degree of xcode setup (TODO: add onboarding steps here, i had xcode already setup)
    - Run `make swift`

1.  **Configure the tool:**
    - (Optional) Run `python utils/list_audio_devices.py` to find your microphone's device index.
    - Review other settings like the `hotkey`.
    - Create an `.env` with `DEV=true` in it.

## Usage

1.  Ensure your virtual environment is active.
2.  Run the main script:
    ```bash
    python3 -m src.main
    ```
    Alternatively run for hot reloading:
    ```bash
    python3 dev.py
    ```
3.  The script will print "Inten tool running. Press [Your Hotkey] to toggle recording."
4.  Go to any text field (text editor, browser, etc.).
5.  Press your configured hotkey. You'll see "Recording started...".
6.  Speak clearly.
7.  Press the hotkey again. You'll see "Recording stopped. Processing..."
8.  The refined text from the LLM should then be typed out at your cursor's location.

## Linting & Formatting

To lint:

```bash
make lint
```

To auto format:

```bash
make format
```

## Notes & Caveats

- **Permissions:** The `keyboard` and `pyautogui` libraries may require special permissions on some operating systems (especially macOS System Preferences -> Security & Privacy -> Accessibility, and sometimes Linux Wayland).
- **API Costs:** Using OpenAI APIs incurs costs based on usage. Monitor your spending.
- **Latency:** There will be a delay between stopping recording and seeing the text typed, due to ASR/LLM processing and network latency.
- **Error Handling:** Basic error handling is included, but complex edge cases might not be covered. Check the console output for errors.
- **Hotkey Conflicts:** Ensure the chosen hotkey doesn't conflict with system or application shortcuts.

## Building and Packaging

### Prerequisites for Building

1. Install PyInstaller:

```bash
pip3 install pyinstaller
```

2. Install system dependencies:

```bash
# macOS
brew install portaudio
```

### Building the App Bundle

1. Set up your local .env file. Copy `.env.local` and fill in the required fields to build.
2. Run the build script:

```bash
./build.sh
```

This will create a `dist` directory containing your `.app` bundle.

Replace "Inten" with your desired app name.

### Debugging the App Bundle

If the app fails to launch, you can debug it from the command line:

1. Run the app directly from the terminal:

```bash
cd dist
./Inten.app/Contents/MacOS/Inten
```

2. Check the Console app for detailed logs:

- Open `/Applications/Utilities/Console.app`
- Look for messages related to your app
- Check `~/Library/Logs/DiagnosticReports/` for crash reports

3. Common issues and solutions:

- Missing modules: Use `--hidden-import` with PyInstaller to include additional modules
- Permission issues: Ensure the app is executable:
  ```bash
  chmod +x dist/Inten.app/Contents/MacOS/Inten
  ```

### Customizing the App Bundle

Customize the build through the `./Inten.spec` file:

Example bundle identifier format:

```
ai.inten.inten
```

Replace with your desired bundle identifier.

## Development

### Formatting + Linting

- If using vscode, install the Ruff extension for the linter our project uses

### Dependencies

- Use `poetry add <dependency>` to add dep to project

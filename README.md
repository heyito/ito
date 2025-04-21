# Inten Tool

This tool listens for voice input via a hotkey, transcribes the speech, processes the transcription with an LLM to understand the user's *intent*, and then types the refined output at the current cursor location.

## Features

* **Hotkey Activated:** Press a configurable hotkey to start recording, press again to stop and process.
* **Speech Recognition:** Transcribes spoken audio using selected ASR provider (initially OpenAI Whisper API).
* **Intent Processing:** Uses an LLM (initially OpenAI GPT API) to refine the raw transcription into intended written text (e.g., correcting grammar, removing filler words, formatting).
* **Automatic Typing:** Simulates keyboard input to type the final text into any application.

## Prerequisites

* Python 3.8+
* PortAudio (system dependency for `sounddevice`)
    * **macOS:** `brew install portaudio`
    * **Debian/Ubuntu:** `sudo apt-get install libportaudio2 libportaudiocpp0 portaudio19-dev`
    * **Windows:** Often included with Python distributions, or installers available online.
* An OpenAI API Key (for initial ASR and LLM providers)

## Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd speech_to_intent
    ```

2.  **Create and activate a virtual environment:**
    ```bash
    python -m venv venv
    # Windows
    venv\Scripts\activate
    # macOS/Linux
    source venv/bin/activate
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4. **Install portaudio:**
    ```bash
    brew install portaudio
    ```

5.  **Configure the tool:**
    * Rename `config.ini.example` to `config.ini` (or create `config.ini`).
    * Edit `config.ini` and add your OpenAI API key.
    * (Optional) Run `python utils/list_audio_devices.py` to find your microphone's device index and update `config.ini` if needed (usually not required if default works).
    * Review other settings like the `hotkey`.

## Configuration (`config.ini`)

* `[OpenAI]`
    * `api_key`: Your OpenAI API key. **Keep this secret!**
* `[ASR]`
    * `provider`: Currently supports `openai_api`. Future: `whisper_local`.
    * `model`: Model to use (e.g., `whisper-1`).
* `[LLM]`
    * `provider`: Currently supports `openai_api`. Future: `local_llm`.
    * `model`: Model to use (e.g., `gpt-4o-mini`, `gpt-3.5-turbo`).
    * `prompt`: The system prompt instructing the LLM how to refine the text. Modify this to tailor the output style.
* `[Audio]`
    * `sample_rate`: Audio sample rate (e.g., `16000`).
    * `channels`: Audio channels (usually `1` for mono mic).
    * `device_index`: (Optional) Specify microphone index if the default is wrong. Leave blank or comment out to use default.
* `[Output]`
    * `method`: How to output text - `typewrite` (simulates typing) or `clipboard` (copies and pastes). `typewrite` is often more reliable.
* `[Hotkeys]`
    * `toggle_recording`: The key combination to start/stop recording (uses `keyboard` library syntax, e.g., `ctrl+alt+space`).

## Usage

1.  Ensure your virtual environment is active.
2.  Run the main script:
    ```bash
    python main.py
    ```
3.  The script will print "Inten tool running. Press [Your Hotkey] to toggle recording."
4.  Go to any text field (text editor, browser, etc.).
5.  Press your configured hotkey. You'll see "Recording started...".
6.  Speak clearly.
7.  Press the hotkey again. You'll see "Recording stopped. Processing..."
8.  The refined text from the LLM should then be typed out at your cursor's location.

## Notes & Caveats

* **Permissions:** The `keyboard` and `pyautogui` libraries may require special permissions on some operating systems (especially macOS System Preferences -> Security & Privacy -> Accessibility, and sometimes Linux Wayland).
* **API Costs:** Using OpenAI APIs incurs costs based on usage. Monitor your spending.
* **Latency:** There will be a delay between stopping recording and seeing the text typed, due to ASR/LLM processing and network latency.
* **Error Handling:** Basic error handling is included, but complex edge cases might not be covered. Check the console output for errors.
* **Hotkey Conflicts:** Ensure the chosen hotkey doesn't conflict with system or application shortcuts.

## Building and Packaging

### Prerequisites for Building

1. Install PyInstaller:
```bash
pip install pyinstaller
```

2. Install system dependencies:
```bash
# macOS
brew install portaudio
```

### Building the App Bundle

1. Navigate to the src directory:
```bash
cd src
```

2. Build the app bundle:
```bash
pyinstaller src/main.py \
    --name Inten \
    --windowed \
    --add-data "config.ini:." \
    --add-binary "/opt/homebrew/opt/portaudio/lib/libportaudio.dylib:." \
    --osx-bundle-identifier ai.inten.inten \
    --noconfirm
```

This will create a `dist` directory containing your `.app` bundle.

### Creating a DMG

1. From the project root directory, create a DMG using hdiutil:
```bash
hdiutil create -volname "Inten" -srcfolder dist -ov -format UDZO Inten.dmg
```

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
- Build with verbose output to catch missing modules:
  ```bash
  pyinstaller src/main.py \
    --name Inten \
    --windowed \
    --add-data "config.ini:." \
    --add-binary "/opt/homebrew/opt/portaudio/lib/libportaudio.dylib:." \
    --osx-bundle-identifier ai.inten.inten \
    --hidden-import audio_handler \
    --hidden-import asr_handler \
    --hidden-import llm_handler \
    --hidden-import prompt_templates \
    --hidden-import platform_utils_macos \
    --noconfirm
  ```

### Customizing the App Bundle

Customize the build command with:
- App name: `--name`
- Bundle identifier: `--osx-bundle-identifier`
- Icon: `--icon`
- Version: `--version-file`

Example bundle identifier format:
```
ai.inten.inten
```

Replace with your desired bundle identifier.
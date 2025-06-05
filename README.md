![Python Version](https://img.shields.io/badge/python-3.12+-blue)
![Poetry](https://img.shields.io/badge/poetry-managed-4B6C8C?logo=python&logoColor=white)
![Pre-commit Enabled](https://img.shields.io/badge/pre--commit-enabled-brightgreen)
![Issues Welcome](https://img.shields.io/badge/contributions-welcome-brightgreen)

# Ito Tool

Ito is a voice-activated productivity tool that transcribes your speech, interprets your intent using an LLM, and types the refined result directly at your cursor. It's designed for fluid voice-to-text interaction—whether you're writing, coding, or capturing quick thoughts.

---

## Features

**Dictation:** Speak freely—your voice is transcribed, intent-matched via LLM, and output as clean, structured text.

**Action:** Voice commands can simulate keyboard input or click/submit actions to drive UI interactions.

---

## Demo

<!-- Insert GIF or screenshot here -->

🔨 Work in progress

---

## Installation

### Prerequisites

- Python 3.12+
- PortAudio (required for audio input)
  - macOS: `brew install portaudio`
  - Ubuntu/Debian: `sudo apt-get install libportaudio2 libportaudiocpp0 portaudio19-dev`
  - Windows: usually included or downloadable
- One of: Groq, Gemini, or OpenAI API keys (required for LLM processing)

### Setup Steps

1. **Clone the repository:**

    ```bash
    git clone https://github.com/demox-labs/ito.git
    cd ito
    ```

2. **Install Poetry:**

    ```bash
    curl -sSL https://install.python-poetry.org | python3 -
    poetry config virtualenvs.in-project true
    export PATH="$HOME/.local/bin:$PATH"
    ```

3. **Install dependencies and initialize environment:**

    ```bash
    make setup
    ```

4. **Activate the virtual environment:**

    ```bash
    # macOS/Linux
    source .venv/bin/activate

    # Windows
    .venv\Scripts\activate
    ```

5. **Build the Swift binary (macOS):**

    _This is for scripts that run in the app, not the app itself_
    
    **Prerequisites**:
    * [Xcode](https://apps.apple.com/us/app/xcode/id497799835) installed 
    * Run `xcode-select --install` 
    * Verify install with `swift --version`

    ```bash
    make swift
    ```

---

## Quick Start

1. Make sure your virtual environment is active.
2. Run the tool:

    ```bash
    python3 -m src.main
    ```

    Or for hot-reloading:

    ```bash
    python3 dev.py
    ```

3. You’ll see: `Ito tool running. Press [Your Hotkey] to toggle recording.`
4. Open any app with a text field (e.g., browser, editor).
5. Press and hold your hotkey, speak clearly, then release once done.
6. The tool will process your speech and type the output.

---

## Settings

### Speech Recognition Settings

Configure how Ito captures and transcribes audio under the **Speech Recognition** tab in the sidebar.

#### ASR Provider

Select the backend used for Automatic Speech Recognition (ASR):

- `openai_api` — Uses OpenAI Whisper via API
- `faster_whisper` — Runs Whisper locally using an optimized implementation
- `groq_api` — Uses Groq’s hosted inference for Whisper models
- `gemini_api` — Uses Google Gemini for transcription


---

#### Compute Type

Controls the underlying model precision when using Groq (or local Whisper if applicable):

- `default` — Uses provider's default configuration
- `int8` — Integer-only, lowest resource usage
- `int8_float16` — Mixed precision, faster on supported hardware
- `float16` — High precision, more resource intensive

### Language Model Settings

Configure how Ito interprets and refines your speech into natural language using LLMs (Large Language Models). These settings control the backend model used for intent recognition and text generation.

#### LLM Source

Choose which backend will process your transcription using a language model:

- `ollama` — Local models run on your own machine (e.g. Mistral, LLaMA, etc.)
- `openai_api` — Uses OpenAI GPT models via their API
- `groq_api` — Hosted inference via Groq (fastest for GPT-based models)
- `gemini_api` — Uses Google Gemini models (formerly Bard)

---

#### OpenAI Model

> Only applicable when `openai_api` is selected as the LLM source.

- `gpt-4.1` — Latest GPT-4 with higher reasoning accuracy
- `gpt-4-turbo` — Faster and cheaper variant of GPT-4
- `gpt-4` — Standard GPT-4 model
- `gpt-3.5-turbo` — Lightweight option for faster responses

---

#### Max Tokens

Controls how long the LLM's output can be. A lower number (e.g. `2000`) means shorter, snappier responses. Increase this if you want more elaborate or detailed output. Recommend putting this no lower than 2000

---

#### Temperature

Controls the creativity or randomness of the LLM:

- `0.0` — Deterministic (same output every time)
- `0.7` — Balanced creativity (default)
- `1.0+` — Very creative, but less predictable

> Higher temperature values yield more expressive results, while lower values stay close to factual or structured outputs.

### API Keys

Ito requires API keys to access cloud-based transcription or language model services. You can enter and manage them in the **API Keys** settings panel.

#### OpenAI API Key

Used when `openai_api` is selected as either the ASR provider or the LLM source.

- Get your key from: [https://platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys)
- Required to access models like Whisper, GPT-4, GPT-3.5

#### Gemini API Key

Used when `gemini_api` is selected as either the ASR provider or the LLM source.

- Get your key from: [https://makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey)
- Required to access Google’s Gemini models (formerly Bard)

#### Groq API Key

Used when `groq_api` is selected for transcription or language modeling.

- Get your key from: [https://console.groq.com/keys](https://console.groq.com/keys)
- Enables high-speed inference using Groq’s Whisper and GPT model endpoints

> Your keys are stored locally and are never shared or sent anywhere except to the selected provider during API calls.

### Mode

Choose how Ito processes your spoken input. This affects how audio is interpreted and converted to text or actions.

#### Application Mode

- `discrete` — Standard two-stage pipeline:
  1. Transcribes audio using the selected ASR provider
  2. Sends the transcription to the selected LLM for refinement or intent detection

- `oneshot (gemini)` — Single-pass mode that sends raw audio **and context** directly to Gemini in one request. Gemini handles both transcription and intent in a single step.

> `oneshot` is only supported with the `gemini_api` backend. It enables faster and more holistic responses but bypasses intermediate transcription.

Use `oneshot` if you're optimizing for speed and contextual fluency with Gemini. Use `discrete` for more control or when using non-Gemini providers.

### Audio Settings

Configure how Ito records microphone input. These settings may impact audio quality, model compatibility, and performance.

#### Sample Rate

Controls how many audio samples are captured per second.

- `8000` — Low quality (telephone)
- `16000` — Standard for speech models like Whisper (recommended)
- `22050` — Medium quality
- `44100` — CD quality
- `48000` — Studio quality

> ⚠️ Higher sample rates may increase latency or CPU load without improving transcription for speech.

#### Channels

Set the number of audio channels to record:

- `1` — Mono (recommended for voice input)
- `2` — Stereo (if your mic captures separate channels)

Most speech recognition models expect mono input. Use stereo only if your setup specifically benefits from it.

### Keyboard Settings

Configure the global hotkeys used to trigger Ito’s functionality.

#### Dictation Hotkey

This hotkey activates **Dictation Mode**, where your speech is transcribed and passed through a language model to generate clean, natural text output.

- Example: `^+fn` (Control + Function)
- Press once to start recording, press again to stop and process

#### Action Hotkey

This hotkey activates **Action Mode**, where your voice is used to trigger interactions like clicking, submitting, or typing actions into the active window.

- Ideal for fast, voice-based UI interactions (e.g. “click send”, “press enter”)

---

Click **Start Recording** next to each field to reassign the hotkey using your keyboard.

### Developer Settings

This section provides tools for debugging, diagnostics, and resetting the application to a clean state.

#### Developer Timing Tools

- **Save Timing Report** — Exports a breakdown of internal timing data (e.g. audio duration, model response times) for performance analysis.
- **Clear Timing Data** — Resets all collected timing metrics. Useful before benchmarking new runs.

#### Log Management Tools

- **Save Log File** — Saves a copy of the app's internal logs for debugging or sharing.
- **Clear Log File** — Erases the current log buffer to start fresh.

#### Reset Settings

- **Reset All** — Wipes all saved user preferences, API keys, audio/input configurations, and resets the app to its initial state.

> ⚠️ This action is destructive and cannot be undone. Use it only if you want to fully reset the app’s configuration.

---

## Community

Have questions, ideas, or feedback? Join the discussion in [GitHub Discussions](https://github.com/demox-labs/ito/discussions) or open an issue.

## Contributing

We welcome contributions! Please open issues for bugs or ideas, and submit PRs for improvements. Before contributing, read:

- [CONTRIBUTING.md](CONTRIBUTING.md) 

## License

GNU General Public License v3.0 © Demox Labs  
See [LICENSE](LICENSE) for full terms.

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

## Community

Have questions, ideas, or feedback? Join the discussion in [GitHub Discussions](https://github.com/demox-labs/ito/discussions) or open an issue.

## Contributing

We welcome contributions! Please open issues for bugs or ideas, and submit PRs for improvements. Before contributing, read:

- [CONTRIBUTING.md](CONTRIBUTING.md) 

## License

MIT © Demox Labs  
See [LICENSE](LICENSE) for full terms.

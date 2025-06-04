# Ito Tool

Ito is a voice-activated productivity tool that transcribes your speech, interprets your intent using an LLM, and types the refined result directly at your cursor. It's designed for fluid voice-to-text interaction—whether you're writing, coding, or capturing quick thoughts.

---

## Features

- **Dictation:** Takes audio command and outputs, using LLM, either an edited document, transcription, etc. Matches intent
- **Action**: Take audio command and takes action on your behalf on the page i.e. clicking, typing, hitting enter. 

---

## Demo

<!-- Insert GIF or screenshot here -->

---

## Installation

### Prerequisites

- Python 3.12+
- PortAudio (required for audio input)
  - macOS: `brew install portaudio`
  - Ubuntu/Debian: `sudo apt-get install libportaudio2 libportaudiocpp0 portaudio19-dev`
  - Windows: usually included or downloadable
- Either Groq, Gemini, or OpenAI API Keys

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
    * Verify install with `swift --verison` 

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
5. Press your hotkey, speak clearly, then press it again.
6. The tool will process your speech and type the output.

---


## Development

### Formatting & Linting

- Run linter:
    ```bash
    make lint
    ```
- Auto-format code:
    ```bash
    make format
    ```
- VS Code users: Install the [Ruff](https://marketplace.visualstudio.com/items?itemName=charliermarsh.ruff) extension.

### Adding Dependencies

Use Poetry to add new dependencies:
```bash
poetry add <dependency-name>
```

## Contributing

We welcome contributions! Please open issues for bugs or ideas, and submit PRs for improvements. Before contributing, read:

- [CONTRIBUTING.md](CONTRIBUTING.md) 

## License

MIT © Demox Labs  
See [LICENSE](LICENSE) for full terms.
# Global Key Listener

A simple Rust crate that captures global keyboard events and outputs them as JSON to stdout using the `rdev` library.

## Features

- Captures global key press and key release events
- Outputs events as JSON with timestamps
- Cross-platform support (Windows, macOS, Linux)
- Includes raw key codes for compatibility

## Requirements

### macOS
You'll need to grant accessibility permissions to your terminal or the compiled binary:
1. Go to System Preferences → Security & Privacy → Privacy → Accessibility
2. Add your terminal application or the compiled binary to the list

### Linux
You may need to run with elevated privileges:
```bash
sudo cargo run
```

### Windows
Should work without additional permissions.

## Installation

1. Make sure you have Rust installed
2. Clone or create this project
3. Run with cargo:

```bash
cargo run
```

## Usage

The program will output JSON events to stdout in this format:

```json
{
  "type": "keydown",
  "key": "KeyA",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "raw_code": 65
}
```

```json
{
  "type": "keyup", 
  "key": "KeyA",
  "timestamp": "2024-01-15T10:30:45.456Z",
  "raw_code": 65
}
```

## Event Fields

- `type`: Either "keydown" or "keyup"
- `key`: The key name as provided by rdev (e.g., "KeyA", "Space", "Return")
- `timestamp`: ISO 8601 timestamp when the event occurred
- `raw_code`: Numeric key code (when available) for compatibility

## Integration with Electron

You can spawn this as a child process from your Electron app:

```javascript
const { spawn } = require('child_process');
const keyListener = spawn('./target/release/global-key-listener');

keyListener.stdout.on('data', (data) => {
  const events = data.toString().trim().split('\n');
  events.forEach(eventStr => {
    try {
      const event = JSON.parse(eventStr);
      console.log('Key event:', event);
      // Handle the key event in your Electron app
    } catch (e) {
      // Ignore malformed JSON
    }
  });
});
```

## Building for Release

```bash
cargo build --release
```

The compiled binary will be in `./target/release/global-key-listener`

## Notes

- This captures ALL keyboard input globally, so use responsibly
- The program will run until terminated with Ctrl+C
- Some special keys might not have raw codes assigned
- Performance is generally good, but capturing every keystroke does use some CPU
# Global Key Listener

A Rust-based global keyboard event listener that captures and blocks keyboard events, designed for integration with Electron applications.

## Features

- Captures global key press and key release events
- Outputs events as JSON with timestamps and raw key codes
- Supports blocking/unblocking specific keys
- Cross-platform support (Windows, macOS, Linux)
- Special handling for modifier keys (including fn key on macOS)
- Command interface for runtime control

## Usage

The key listener can be controlled through stdin commands in JSON format:

```json
// Block specific keys
{"command": "block", "keys": ["KeyA", "KeyB", "KeyC"]}

// Unblock a specific key
{"command": "unblock", "key": "KeyA"}

// Get list of currently blocked keys
{"command": "get_blocked"}
```

Events are output to stdout in JSON format:

```json
{
  "type": "keydown",
  "key": "KeyA",
  "timestamp": "2024-06-14T01:58:44.617Z",
  "raw_code": 65
}
```

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

## Building

```bash
cargo build --release
```

The binary will be available at `target/release/global-key-listener`

## Integration with Electron

When integrating with Electron:

1. Copy the compiled binary to your app's resources directory
2. Use the binary path from `process.resourcesPath` in production
3. Use the development path (`target/release/global-key-listener`) during development
4. Ensure proper error handling and process management in your Electron app

## Key Names

The key listener uses standard key names that match the `rdev` library's Key enum. Common examples:

- `KeyA` through `KeyZ` for letter keys
- `Digit1` through `Digit9` for number keys
- `Function` for the fn key (macOS)
- `ShiftLeft`, `ShiftRight` for modifier keys
- `Space`, `Enter`, `Escape` for special keys

## Notes

- This captures ALL keyboard input globally, so use responsibly
- The program will run until terminated with Ctrl+C
- Some special keys might not have raw codes assigned
- Performance is generally good, but capturing every keystroke does use some CPU

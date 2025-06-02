import sounddevice as sd


def list_audio_devices():
    """Prints available audio input and output devices."""
    print("Available audio devices:")
    try:
        devices = sd.query_devices()
        print(devices)
        print("\nInput devices:")
        for i, device in enumerate(devices):
            # Check if 'max_input_channels' exists and is greater than 0
            if device.get('max_input_channels', 0) > 0:
                 print(f"  Index {i}: {device['name']} (Max Input Channels: {device['max_input_channels']})")

        # Find default input device
        try:
            default_input_index = sd.query_hostapis()[0]['default_input_device']
            if default_input_index != -1: # -1 indicates no default device
                print(f"\nDefault Input Device: Index {default_input_index} - {devices[default_input_index]['name']}")
            else:
                print("\nNo default input device found.")
        except (IndexError, KeyError):
             print("\nCould not determine default input device automatically.")


    except Exception as e:
        print(f"Could not query audio devices: {e}")
        print("Ensure PortAudio is installed correctly.")

if __name__ == "__main__":
    list_audio_devices()
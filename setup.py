from setuptools import setup
import sys # Import the sys module

# Increase Python's recursion depth limit for py2app's analysis
# This seems necessary for complex dependency graphs.
try:
    # Setting a higher limit (e.g., 5000) can help py2app parse complex dependencies
    # Adjust the value if needed, but excessively high values can cause crashes.
    sys.setrecursionlimit(5000)
    print("Recursion limit set to 5000") # Optional: confirmation message
except Exception as e:
    print(f"Warning: Failed to set recursion limit - {e}")

APP = ['src/main.py'] # Assumes main.py is in the same directory as setup.py
DATA_FILES = ['config.ini'] # Assumes config.ini is in the same directory
                            # This will place config.ini inside YourApp.app/Contents/Resources/

# If main.py and config.ini are in './src':
# APP = ['src/main.py']
# DATA_FILES = [('src/config.ini', ['config.ini'])] # Places src/config.ini into Resources/config.ini

OPTIONS = {
    'argv_emulation': True, # Good for macOS GUI apps
    'packages': [
        'PyQt6', # Explicitly include complex GUI framework
        # Let py2app try to find numpy, requests, sounddevice, openai, etc. automatically
        # DO NOT add 'rubicon' or 'rubicon.objc' here initially
    ],
    'includes': [
        # Start empty. Add specific modules here ONLY if py2app fails to find them later
        # e.g., if you get a runtime ModuleNotFoundError for 'xyz', try adding 'xyz' here.
    ],
    'excludes': [
        'tkinter', # Usually safe to exclude if using PyQt6
        'wheel',
        'setuptools'
        # Add other large libraries here ONLY if you are SURE they aren't needed
        # e.g., 'matplotlib', 'pandas' if they somehow get included transitively
    ],
    'frameworks': [
        # Crucial for PortAudio needed by sounddevice/PyAudio
        # Verify this path is correct for your Homebrew installation!
        '/opt/homebrew/opt/portaudio/lib/libportaudio.dylib',
    ],
    'plist': {
        'CFBundleName': 'Inten',
        'CFBundleDisplayName': 'Inten',
        'CFBundleGetInfoString': "Speech to Intent Tool",
        'CFBundleIdentifier': "ai.inten.inten", # Use a unique identifier
        'CFBundleVersion': "1.0.0",
        'CFBundleShortVersionString': "1.0.0",
        'NSMicrophoneUsageDescription': 'This app needs microphone access to record voice commands.',
        'NSAppleEventsUsageDescription': 'This app needs automation access to control other applications.',
        'LSUIElement': True,  # Makes the app run as a background application without a Dock icon
    },
    # Add options for signing or icons here if needed later
    # 'iconfile': 'path/to/your/icon.icns',
}

setup(
    name="Inten", # Your application's name
    app=APP,
    data_files=DATA_FILES,
    options={'py2app': OPTIONS},
    setup_requires=['py2app'],
)
from setuptools import setup

APP = ['src/main.py']
DATA_FILES = ['config.ini']
OPTIONS = {
    'excludes': [
        'setuptools._vendor',
        'pip._vendor',
        'typing_extensions',
        'setuptools._vendor.typing_extensions',
        'pip._vendor.typing_extensions',
        'packaging',
        'setuptools._vendor.packaging',
        'pip._vendor.packaging',
        'backports',
        'setuptools._vendor.backports',
        'pip._vendor.backports',
        'backports.tarfile',
        'setuptools._vendor.backports.tarfile',
        'pip._vendor.backports.tarfile',
        'wheel',
        'setuptools._vendor.wheel',
        'pip._vendor.wheel',
        'importlib_metadata',
        'setuptools._vendor.importlib_metadata',
        'pip._vendor.importlib_metadata',
    ],
    'packages': ['src'],  # Include your src package
    'includes': [
        'PyQt6',
        'numpy',
        'keyboard',
        'configparser',
        'queue',
        'threading',
        'platform',
        'socket',
        'json',
        'jaraco',
        'jaraco.text',
    ],
    'plist': {
        'CFBundleName': 'Inten',
        'CFBundleDisplayName': 'Inten',
        'CFBundleGetInfoString': "Speech to Intent Tool",
        'CFBundleIdentifier': "ai.inten.inten",
        'CFBundleVersion': "1.0.0",
        'CFBundleShortVersionString': "1.0.0",
        'NSMicrophoneUsageDescription': 'This app needs microphone access to record voice commands.',
        'NSAppleEventsUsageDescription': 'This app needs automation access to control TextEdit.',
    },
    'frameworks': [
        '/opt/homebrew/opt/libffi/lib/libffi.8.dylib',  # <-- update this path as needed
    ],
}

setup(
    app=APP,
    data_files=DATA_FILES,
    options={'py2app': OPTIONS},
    setup_requires=['py2app'],
)
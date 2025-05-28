# -*- mode: python ; coding: utf-8 -*-

info_plist_dict = {
    'LSBackgroundOnly': False,
    'NSHighResolutionCapable': True,
    # These keys are often better explicitly set here to ensure they appear
    # even if PyInstaller generates them differently or with older values.
    'CFBundleShortVersionString': '1.0.0',
    'CFBundleDisplayName': 'Inten',
    'CFBundleExecutable': 'Inten',
    'CFBundleIdentifier': 'ai.inten.inten', # This should match bundle_identifier in BUNDLE
    'CFBundleName': 'Inten',
    'CFBundlePackageType': 'APPL',
    
    # Prevent app nap
    'LSApplicationCategoryType': 'public.app-category.utilities',
    'NSAppTransportSecurity': {
        'NSAllowsArbitraryLoads': True
    },
    'NSSupportsAutomaticTermination': 'false',
    'NSSupportsSuddenTermination': 'false',
    'NSAppSleepDisabled': True,

    # Privacy Usage Descriptions - CRITICAL for macOS privacy prompts
    'NSMicrophoneUsageDescription': 'Inten needs access to your microphone to record and process voice commands.',
    'NSAppleEventsUsageDescription': 'Inten needs access to control other applications to perform actions.',
    'NSAccessibilityUsageDescription': 'Inten needs accessibility permissions to control other applications.',
    'NSScreenCaptureUsageDescription': 'Inten needs screen recording permission to capture and process window content.',
    'NSKeyboardUsageDescription': 'Inten needs keyboard access to process keyboard input and commands.',
}

a = Analysis(
    ['src/main.py'],
    pathex=['src'],
    binaries=[
        ('/opt/homebrew/opt/portaudio/lib/libportaudio.dylib', '.'),
        ('./.venv/lib/python3.12/site-packages/vosk/libvosk.dyld', 'vosk'),
    ],
    datas=[
        ('inten-logo.png', '.'),
        ('inten-logo-dark.png', '.'),
        ('src/bin/inten_macos_agent', '.'),
        ('src/models/vosk-model-en-us-0.22-lgraph', 'models/vosk-model-en-us-0.22-lgraph'),
    ],
    hiddenimports=[
      'native_messaging_host',
      'dependency_injector.errors',
      'dependency_injector.wiring',
      'vosk'
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Inten',
    debug=True,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    info_plist=info_plist_dict,
    entitlements_file='entitlements.plist',
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='Inten',
)
app = BUNDLE(
    coll,
    name='Inten.app',
    icon='icon.icns',
    bundle_identifier='ai.inten.inten',
    info_plist=info_plist_dict,
    entitlements_file='entitlements.plist',
)

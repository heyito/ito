# -*- mode: python ; coding: utf-8 -*-

info_plist_dict = {
    'LSBackgroundOnly': False,
    'NSHighResolutionCapable': True,
    # These keys are often better explicitly set here to ensure they appear
    # even if PyInstaller generates them differently or with older values.
    'CFBundleShortVersionString': '1.0.0',
    'CFBundleDisplayName': 'Ito',
    'CFBundleExecutable': 'Ito',
    'CFBundleIdentifier': 'ai.ito.ito',
    'CFBundleName': 'Ito',
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
    'NSMicrophoneUsageDescription': 'Ito needs access to your microphone to record and process voice commands.',
    'NSAppleEventsUsageDescription': 'Ito needs access to control other applications to perform actions.',
    'NSAccessibilityUsageDescription': 'Ito needs accessibility permissions to control other applications.',
    'NSScreenCaptureUsageDescription': 'Ito needs screen recording permission to capture and process window content.',
    'NSKeyboardUsageDescription': 'Ito needs keyboard access to process keyboard input and commands.',
}

a = Analysis(
    ['src/main.py'],
    pathex=['src'],
    binaries=[
        ('/opt/homebrew/opt/portaudio/lib/libportaudio.dylib', '.'),
    ],
    datas=[
        ('ito-logo.png', '.'),
        ('ito-logo-dark.png', '.'),
        ('src/bin/ito_macos_agent', '.'),
        ('src/ui/font/fonts/Inter-Regular.ttf', './fonts'),
        ('src/ui/font/fonts/Inter-Medium.ttf', './fonts'),
        ('src/ui/font/fonts/Inter-SemiBold.ttf', './fonts'),
        ('src/ui/font/fonts/Inter-Bold.ttf', './fonts'),
    ],
    hiddenimports=[
      'native_messaging_host',
      'dependency_injector.errors',
      'dependency_injector.wiring',
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
    name='Ito',
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
    name='Ito',
)
app = BUNDLE(
    coll,
    name='Ito.app',
    icon='icon.icns',
    bundle_identifier='ai.ito.ito',
    info_plist=info_plist_dict,
    entitlements_file='entitlements.plist',
)

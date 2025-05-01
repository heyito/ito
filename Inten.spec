# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['src/main.py'],
    pathex=['src'],
    binaries=[('/opt/homebrew/opt/portaudio/lib/libportaudio.dylib', '.')],
    datas=[
        ('config.ini', '.'),
        ('inten-logo.png', '.'),
        ('./venv/lib/python3.12/site-packages/PyQt6/Qt6/plugins/platforms', 'PyQt6/Qt6/plugins/platforms'),
        ('./venv/lib/python3.12/site-packages/PyQt6/Qt6/plugins/styles', 'PyQt6/Qt6/plugins/styles'),
        ('./venv/lib/python3.12/site-packages/PyQt6/Qt6/plugins/imageformats', 'PyQt6/Qt6/plugins/imageformats'),
        ('./venv/lib/python3.12/site-packages/PyQt6/Qt6/plugins/permissions', 'PyQt6/Qt6/plugins/permissions'),
        ('./venv/lib/python3.12/site-packages/PyQt6/Qt6/plugins/position', 'PyQt6/Qt6/plugins/position'),
    ],
    hiddenimports=[
      'native_messaging_host',
      'dependency_injector.errors',
      'dependency_injector.wiring'
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
    entitlements_file=None,
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
    info_plist={
        'LSBackgroundOnly': False,
        'NSHighResolutionCapable': True,
        'CFBundleShortVersionString': '1.0.0',
        'NSLocationWhenInUseUsageDescription': 'Inten uses location to provide relevant features based on your area.',
        'NSMicrophoneUsageDescription': 'Inten needs access to your microphone to record and process voice commands.',
        'NSAppleEventsUsageDescription': 'Inten needs access to control other applications to perform actions.',
        'NSAccessibilityUsageDescription': 'Inten needs accessibility permissions to control other applications.',
    },
    entitlements_file='entitlements.plist',
)

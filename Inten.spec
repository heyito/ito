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
    upx=True,
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
    upx=True,
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
    },
)

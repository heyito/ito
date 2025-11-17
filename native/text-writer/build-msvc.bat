@echo off
REM Build script for MSVC toolchain

REM Setup Visual Studio environment
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" x64 >nul

REM Debug: Show that LIB is set
echo LIB environment is set: %LIB:~0,50%...

REM Clean previous build
cargo clean >nul 2>&1

REM Build with MSVC
cargo build --release --target x86_64-pc-windows-msvc

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Build complete! Binary at: target\x86_64-pc-windows-msvc\release\text-writer.exe
) else (
    echo.
    echo Build failed with error code %ERRORLEVEL%
    exit /b %ERRORLEVEL%
)

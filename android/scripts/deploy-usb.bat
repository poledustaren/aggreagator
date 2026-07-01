@echo off
REM Build debug APK and install it on the Android phone connected via USB (Windows).
REM
REM Requirements:
REM   - Android SDK (ANDROID_HOME / ANDROID_SDK_ROOT) + platform-tools (adb)
REM   - JDK 17+
REM   - USB debugging enabled on the phone (Settings -> Developer options)
REM
REM Run from repo root:
REM   android\scripts\deploy-usb.bat

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%\.." || exit /b 1

REM 1. adb available?
set "ADB=adb"
where adb >nul 2>nul
if errorlevel 1 (
    REM Try common Windows Android SDK locations.
    if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" (
        set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
    ) else if exist "%USERPROFILE%\AppData\Local\Android\Sdk\platform-tools\adb.exe" (
        set "ADB=%USERPROFILE%\AppData\Local\Android\Sdk\platform-tools\adb.exe"
    ) else if exist "C:\Program Files\Android\Sdk\platform-tools\adb.exe" (
        set "ADB=C:\Program Files\Android\Sdk\platform-tools\adb.exe"
    ) else (
        echo ERROR: adb not found. Install Android SDK platform-tools and add it to PATH.
        echo Default location: %%LOCALAPPDATA%%\Android\Sdk\platform-tools
        exit /b 1
    )
)

REM 2. Any device connected?
set "DEVICES="
for /f "skip=1 tokens=1,2" %%a in ('"%ADB%" devices') do (
    if "%%b"=="device" (
        set "DEVICES=%%a"
    )
)
if "!DEVICES!"=="" (
    echo ERROR: phone not found. Connect via USB, enable USB debugging and trust this computer.
    echo Check: adb devices
    exit /b 1
)
echo Device: !DEVICES!

REM 3. Gradle wrapper
if exist gradlew.bat (
    set "GRADLE=gradlew.bat"
) else (
    echo ERROR: gradlew.bat not found.
    echo Open android/ in Android Studio once to generate the wrapper, or install Gradle.
    exit /b 1
)

REM 4. Build + install (installDebug builds the APK and pushes it via adb).
echo Building and installing debug APK...
%GRADLE% installDebug
if errorlevel 1 (
    echo.
    echo Build failed. Common causes:
    echo   - duplicate constant/function declarations (see compiler errors above);
    echo   - JDK is not version 17;
    echo   - Android SDK is missing or AGP/Gradle/Kotlin versions mismatch.
    exit /b 1
)

echo.
echo Done. On the phone:
echo   1. Open the Aggregat app.
echo   2. Grant notification access (in-app button -> system settings).
echo   3. Server address is preset: http://100.93.215.38:8000 (Netbird).
echo   4. The app will register and receive a token - copy it for the web dashboard.

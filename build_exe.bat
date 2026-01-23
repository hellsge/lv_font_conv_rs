@echo off
REM Build Windows EXE with pkg (~43MB)

echo ========================================
echo   Build lv_font_conv Windows EXE
echo ========================================
echo.

REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)

echo [1/3] Checking dependencies...
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
) else (
    echo Dependencies found, skipping install
)

echo.
echo [2/3] Building EXE...
call npm run build:exe
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build failed
    pause
    exit /b 1
)

echo.
echo [3/3] Verifying output...
if exist "dist\lv_font_conv.exe" (
    echo [SUCCESS] EXE created!
    echo.
    echo File: %CD%\dist\lv_font_conv.exe
    for %%A in ("dist\lv_font_conv.exe") do echo Size: %%~zA bytes
    echo.
    echo Testing...
    dist\lv_font_conv.exe --version
    echo.
    echo ========================================
    echo   Build Complete!
    echo ========================================
    echo.
    echo Usage:
    echo   dist\lv_font_conv.exe --help
    echo.
) else (
    echo [ERROR] EXE not found
    pause
    exit /b 1
)

pause

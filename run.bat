@echo off
title DocuShrink - PDF Compressor Web App
echo ========================================================
echo               DocuShrink - Web Application
echo ========================================================
echo Membuka aplikasi DocuShrink di peramban web...
echo.

:: Try starting with Python local server if available, else open index.html directly
where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo Menjalankan local server via Python di http://localhost:8080/ ...
    start http://localhost:8080/index.html
    python -m http.server 8080
) else (
    echo Membuka langsung berkas index.html di browser default...
    start index.html
)
pause

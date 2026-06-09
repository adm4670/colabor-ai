@echo off
cd /d C:\Developer\colabor-ai
echo ========================================
echo      COLABOR-AI BUILD
echo ========================================
echo.
echo Executando: npx tsc
echo.
call npx tsc 2>&1
echo.
echo ========================================
if %ERRORLEVEL% EQU 0 (
    echo ✅ BUILD CONCLUIDO COM SUCESSO!
) else (
    echo ❌ BUILD FALHOU - Codigo de erro: %ERRORLEVEL%
)
echo ========================================
pause

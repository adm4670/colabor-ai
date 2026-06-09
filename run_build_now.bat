@echo off
cd /d C:\Developer\colabor-ai
echo ===== INICIO DO BUILD ===== > build_result.txt
call npx tsc 2>&1 >> build_result.txt
echo EXIT_CODE=%ERRORLEVEL% >> build_result.txt
echo ===== FIM DO BUILD ===== >> build_result.txt
type build_result.txt

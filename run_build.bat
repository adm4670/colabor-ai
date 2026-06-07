@echo off
cd /d C:\Developer\colabor-ai
call npm run build > C:\Developer\colabor-ai\build_output.txt 2>&1
echo EXIT_CODE=%ERRORLEVEL% >> C:\Developer\colabor-ai\build_output.txt
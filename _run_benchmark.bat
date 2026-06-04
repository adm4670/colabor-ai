@echo off
cd /d "C:\Developer\colabor-ai"
"node_modules\.bin\tsx.cmd" _benchmark_init.ts > _benchmark_output.txt 2>&1

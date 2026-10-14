@echo off
chcp 65001 > nul
title 어문회 한자능력검정시험 학습기 (8급~6급)

cd /d "%~dp0"

echo ========================================================
echo   어문회 한자능력검정시험 학습기 (8급~6급)
echo   [PC / 아이패드 / 스마트폰 클라우드 동기화 지원]
echo ========================================================
echo.
echo * 로컬 웹서버를 시작하고 브라우저를 엽니다...
echo.

timeout /t 1 /nobreak > nul
start "" "http://localhost:8080"

node server.js

pause

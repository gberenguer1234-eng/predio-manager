@echo off
title Gestao de Obra - Servidor
cd /d C:\Users\gbere\predio-manager
echo.
echo  ==========================================
echo   Gestao de Obra - iniciando servidor...
echo  ==========================================
echo.
echo  Acesse no navegador: http://localhost:5000
echo  Para encerrar: feche esta janela
echo.
start "" "http://localhost:5000"
node server.js
pause

@echo off
title Gestao de Obra - ACESSO PUBLICO
cd /d C:\Users\gbere\predio-manager
color 0A

echo.
echo  ============================================================
echo   Gestao de Obra - ACESSO PUBLICO (Cloudflare Tunnel)
echo  ============================================================
echo.
echo  Iniciando servidor local na porta 5000...
echo.

:: Mata processos anteriores se existirem
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM cloudflared.exe >nul 2>&1

:: Inicia o servidor Node em segundo plano
start /B node server.js > server.log 2>&1

:: Aguarda o servidor iniciar
timeout /t 3 /nobreak >nul

:: Abre o acesso local no navegador
start "" "http://localhost:5000"

echo  Servidor local iniciado: http://localhost:5000
echo.
echo  ============================================================
echo   Criando tunel publico... aguarde a URL aparecer abaixo
echo  ============================================================
echo.
echo  >> Compartilhe a URL "trycloudflare.com" com outros dispositivos
echo  >> A URL muda a cada inicializacao deste bat
echo  >> Para encerrar: feche esta janela
echo.

:: Inicia o tunel - a URL publica aparece na tela
cloudflared.exe tunnel --url http://localhost:5000

echo.
echo  Tunel encerrado. Pressione qualquer tecla para sair.
pause >nul

@echo off
echo ==============================================
echo INICIANDO LA PLATAFORMA WORKWEB AGENTS...
echo ==============================================
echo.
echo Levantando servidor local y proxy...
start cmd /k "node WORKWEB-SERVIDOR.js"

echo Esperando a que el servidor se caliente...
timeout /t 2 >nul

echo Abriendo el hub de agentes en Chrome...
start http://localhost:8000/
exit

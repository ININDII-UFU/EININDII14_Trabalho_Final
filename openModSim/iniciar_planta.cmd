@echo off
setlocal
set "PROJECT=%~dp0planta_nivel_tanque.omsim"

if not exist "%PROJECT%" (
    echo ERRO: projeto nao encontrado:
    echo %PROJECT%
    pause
    exit /b 1
)

for %%E in (
    "%ProgramFiles%\Open ModSim 2\omodsim.exe"
    "%ProgramFiles%\OpenModSim\omodsim.exe"
    "%LocalAppData%\Programs\Open ModSim 2\omodsim.exe"
) do (
    if exist "%%~E" (
        start "" "%%~E" "%PROJECT%"
        exit /b 0
    )
)

where omodsim.exe >nul 2>&1
if not errorlevel 1 (
    start "" omodsim.exe "%PROJECT%"
    exit /b 0
)

echo O executavel do Open ModSim nao foi localizado automaticamente.
echo Tentando abrir pela associacao do arquivo .omsim...
start "" "%PROJECT%"
if errorlevel 1 (
    echo Abra manualmente o Open ModSim e carregue:
    echo %PROJECT%
    pause
    exit /b 1
)

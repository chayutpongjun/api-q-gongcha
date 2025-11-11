@echo off
echo 🚀 Running Gongcha Queue Management System Docker Container...

REM Stop and remove existing container if exists
docker stop gongcha-queue 2>nul
docker rm gongcha-queue 2>nul

REM Run the Docker container with environment variables from .env
docker run -d ^
  --name gongcha-queue ^
  -p 10001:10001 ^
  -e NODE_ENV=production ^
  -e PORT=10001 ^
  -e HOST=0.0.0.0 ^
  -e DB_MAIN_SERVER=203.150.191.149,28914 ^
  -e DB_MAIN_DATABASE=CFS_Gongcha_Main ^
  -e DB_MAIN_USER=gongcha ^
  -e DB_MAIN_PASSWORD=Faofao000@ ^
  -e JWT_SECRET=your_jwt_secret_here ^
  --restart unless-stopped ^
  gongcha-queue:latest

if %ERRORLEVEL% EQU 0 (
    echo ✅ Container started successfully!
    echo.
    echo 📊 Container status:
    docker ps -f name=gongcha-queue
    echo.
    echo 📱 Access URLs:
    echo - API Health: http://localhost:10001/health
    echo - Test TTS: http://localhost:10001/test-tts.html
    echo.
    echo 📋 View logs:
    echo docker logs -f gongcha-queue
    echo.
    echo 🔄 Stop container:
    echo docker stop gongcha-queue
) else (
    echo ❌ Failed to start container!
    exit /b 1
)

pause

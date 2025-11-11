@echo off
echo 🚀 Building Gongcha Queue Management System Docker Image...

REM Build the Docker image
docker build -t gongcha-queue:latest .

if %ERRORLEVEL% EQU 0 (
    echo ✅ Docker image built successfully!
    echo 📊 Image size:
    docker images gongcha-queue:latest
    
    echo.
    echo � To run the container:
    echo docker run -d -p 10000:10000 -p 8080:8080 --name gongcha-queue gongcha-queue:latest
    echo.
    echo 🔄 To stop the container:
    echo docker stop gongcha-queue
    echo.
    echo 🗑️ To remove the container:
    echo docker rm gongcha-queue
    echo.
    echo 📱 Access URLs:
    echo - API: http://localhost:10000/health
    echo - Web App: http://localhost:8080/rest/1
) else (
    echo ❌ Docker build failed!
    exit /b 1
)

pause
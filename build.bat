@echo off
echo 🚀 Building DuckieDoze Queue Management System Docker Image...

REM Build the Docker image
docker build -t DuckieDoze-queue:latest .

if %ERRORLEVEL% EQU 0 (
    echo ✅ Docker image built successfully!
    echo 📊 Image size:
    docker images DuckieDoze-queue:latest
    
    echo.
    echo � To run the container:
    echo docker run -d -p 10000:10000 -p 8080:8080 --name DuckieDoze-queue DuckieDoze-queue:latest
    echo.
    echo 🔄 To stop the container:
    echo docker stop DuckieDoze-queue
    echo.
    echo 🗑️ To remove the container:
    echo docker rm DuckieDoze-queue
    echo.
    echo 📱 Access URLs:
    echo - API: http://localhost:10000/health
    echo - Web App: http://localhost:8080/rest/1
) else (
    echo ❌ Docker build failed!
    exit /b 1
)

pause
#!/bin/bash

echo "========================================"
echo "Building Docker Image for Gongcha Queue API"
echo "========================================"

IMAGE_NAME="thanvasu/q-gongcha"
VERSION="v1.0.21.api"

echo ""
echo "Building image: ${IMAGE_NAME}:${VERSION}"
docker build -t ${IMAGE_NAME}:${VERSION} -f Dockerfile .

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Build failed!"
    exit 1
fi

echo ""
echo "✅ Build successful!"
echo ""
echo "Tagging as latest..."
docker tag ${IMAGE_NAME}:${VERSION} ${IMAGE_NAME}:latest

echo ""
echo "Pushing to Docker Hub..."
docker push ${IMAGE_NAME}:${VERSION}
docker push ${IMAGE_NAME}:latest

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Push failed!"
    exit 1
fi

echo ""
echo "========================================"
echo "✅ Successfully built and pushed:"
echo "   - ${IMAGE_NAME}:${VERSION}"
echo "   - ${IMAGE_NAME}:latest"
echo "========================================"
echo ""
echo "To deploy, run:"
echo "docker pull ${IMAGE_NAME}:${VERSION}"
echo "docker stop q-gongcha-api && docker rm q-gongcha-api"
echo "docker run -d --name q-gongcha-api -p 10001:10001 ${IMAGE_NAME}:${VERSION}"
echo ""

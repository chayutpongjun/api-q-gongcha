# Gongcha Queue API Server

API Server สำหรับระบบจัดการคิว Gongcha

## Features

- RESTful API endpoints
- WebSocket real-time updates
- JWT Authentication
- SQL Server integration
- CORS support

## API Endpoints

- `GET /health` - Health check
- `POST /api/queue/execute-jwt` - Execute queue operations with JWT
- WebSocket endpoint for real-time updates

## Environment Variables

```
PORT=10001
DB_MAIN_SERVER=203.150.191.149,28914
DB_MAIN_DATABASE=CFS_Gongcha_Main
DB_MAIN_USER=gongcha
DB_MAIN_PASSWORD=your_password
JWT_SECRET=your_jwt_secret
```

## Installation

```bash
npm install
npm start
```

## Docker

```bash
docker build -t gongcha-api .
docker run -d -p 10001:10001 gongcha-api
```

## Production URLs

- API: https://api-q-203.150.191.149
- WebSocket: wss://api-q-203.150.191.149

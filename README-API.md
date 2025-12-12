# DuckieDoze Queue API Server

API Server สำหรับระบบจัดการคิว DuckieDoze

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
PORT=10000
DB_MAIN_SERVER=tvsdb1.thanvasupos.com,28914
DB_MAIN_DATABASE=CFS_DuckieDoze_Main
DB_MAIN_USER=uinet
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
docker build -t DuckieDoze-api .
docker run -d -p 10000:10000 DuckieDoze-api
```

## Production URLs

- API: https://api-q-203.150.191.149
- WebSocket: wss://api-q-203.150.191.149

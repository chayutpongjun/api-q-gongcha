# Gongcha Queue Frontend

Frontend Application สำหรับระบบจัดการคิว Gongcha

## Features
- Responsive web design
- Real-time queue updates via WebSocket
- Push notifications
- Mobile-friendly interface
- Red-gold theme with custom logo

## Technology
- HTML5/CSS3/JavaScript
- WebSocket client
- Notification API
- Express.js static server

## API Connection
Frontend เชื่อมต่อกับ API Server:
- API: `https://api-q-gongcha.thanvasupos.com`
- WebSocket: `wss://api-q-gongcha.thanvasupos.com`

## Installation
```bash
npm install
npm start
```

## Docker
```bash
docker build -t gongcha-frontend .
docker run -d -p 8080:8080 gongcha-frontend
```

## Production URLs
- Frontend: https://q-gongcha.thanvasupos.com

## Features
- ✅ Real-time queue monitoring
- ✅ Status-based sorting (พร้อมเสิร์ฟ/รอดำเนินการ)
- ✅ Pagination (10 items per page)
- ✅ Comprehensive notification system
- ✅ Mobile responsive design
- ✅ Custom logo integration
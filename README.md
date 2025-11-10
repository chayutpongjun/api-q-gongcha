# Gongcha Queue Management Mobile App

## Overview

ระบบดู Q ผ่านมือถือสำหรับ Gongcha ที่เชื่อมต่อกับ SQL Server Database

## Features

- เชื่อมต่อ Main Database เพื่อดึงข้อมูลการเชื่อมต่อของแต่ละร้าน
- เชื่อมต่อ Restaurant Database เพื่อดึงข้อมูล Queue
- แสดงผล Queue แบ่งตาม QueStatus (Ready, Preparing, Completed, Cancelled)
- เรียงลำดับตาม QueCreatedatetime
- Real-time refresh ทุก 30 วินาที
- UI ที่เหมาะสำหรับ Mobile

## Project Structure

```
Q-Mobile-Gongcha/
├── backend/                 # Node.js API Server
│   ├── services/
│   │   └── databaseService.js
│   ├── routes/
│   │   └── queueRoutes.js
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── src/                     # React Native App
│   ├── screens/
│   │   ├── QueueDashboard.js
│   │   └── QueueDetails.js
│   ├── services/
│   │   └── apiService.js
│   └── App.js
├── package.json
├── index.js
└── README.md
```

## Installation

### Prerequisites

- Node.js (v14 or higher)
- React Native CLI
- Android Studio / Xcode
- SQL Server access

### Backend Setup

1. Navigate to backend directory:

   ```bash
   cd backend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy environment file:

   ```bash
   copy .env.example .env
   ```

4. Configure database connection in `.env`:

   ```
   DB_MAIN_SERVER=your_main_server_name
   DB_MAIN_DATABASE=CFS_Gongcha_Main
   DB_MAIN_USER=your_username
   DB_MAIN_PASSWORD=your_password
   PORT=10001
   ```

5. Start the backend server:
   ```bash
   npm start
   ```

### Mobile App Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. For Android:

   ```bash
   npm run android
   ```

3. For iOS:
   ```bash
   npm run ios
   ```

## API Endpoints

### Get Queue Data

```
GET /api/queue/restaurant/:restId
```

ดึงข้อมูล Queue ทั้งหมดของร้าน

### Get Queue by Status

```
GET /api/queue/restaurant/:restId/status/:status
```

ดึงข้อมูล Queue ตาม Status (ready, preparing, completed, cancelled)

### Get Queue Summary

```
GET /api/queue/restaurant/:restId/summary
```

ดึงสรุปจำนวน Queue แต่ละ Status

### Health Check

```
GET /api/queue/health
```

ตรวจสอบสถานะการเชื่อมต่อ Database

## Database Schema

### Main Database (CFS_Gongcha_Main)

Table: `Tbl_Rest`

- RestID
- RestName
- RestServerName
- RestDBName
- RestUserName
- RestPassword

### Restaurant Database

Stored Procedure: `[dbo].[Sp_TB_QueOrderStatus]`

- Parameters: 'ALL', 0
- Returns: Queue data with QueStatus, QueName, QueCreatedatetime, etc.

## Usage Flow

1. **App เริ่มต้น**: เชื่อมต่อ Main Database
2. **เลือกร้าน**: ใส่ Restaurant ID
3. **ดึงข้อมูลร้าน**: จาก Tbl_Rest ด้วย RestID
4. **เชื่อมต่อร้าน**: ใช้ข้อมูลที่ได้จาก Tbl_Rest
5. **เรียก Stored Procedure**: [dbo].[Sp_TB_QueOrderStatus] 'ALL', 0
6. **แสดงผล**: จัดกลุ่มตาม QueStatus และเรียงตาม QueCreatedatetime

## Features

### Dashboard

- แสดงสรุปจำนวน Queue แต่ละ Status
- แสดง Ready Queue ล่าสุด
- Auto-refresh ทุก 30 วินาที
- Pull-to-refresh

### Queue Details

- แสดงรายละเอียด Queue แต่ละรายการ
- ข้อมูลลูกค้า (ถ้ามี)
- เวลาสร้างและอัพเดท Queue
- เรียงตามเวลาล่าสุด

## Development

### Start Development Server

```bash
npm run dev
```

This will start both backend server and React Native metro bundler

### Backend Only

```bash
npm run server
```

### Mobile App Only

```bash
npm start
```

## Configuration Notes

1. **Database Connection**: ระบบจะเชื่อมต่อ Main Database ก่อน จากนั้นใช้ข้อมูลที่ได้มาเชื่อมต่อ Restaurant Database
2. **Connection Pooling**: ใช้ Connection Pool เพื่อการจัดการ Connection ที่มีประสิทธิภาพ
3. **Error Handling**: มี Error Handling ที่ครอบคลุมทั้ง Database และ Network errors
4. **Security**: ใช้ Environment Variables สำหรับข้อมูลสำคัญ

## Troubleshooting

### Common Issues

1. **Database Connection Failed**: ตรวจสอบ .env file และ SQL Server connection
2. **API Not Responding**: ตรวจสอบว่า Backend server รันอยู่ที่ port 10001
3. **Metro Bundle Error**: ลบ node_modules และ install ใหม่

### Debug Mode

เปิด Debug mode ใน React Native Debugger เพื่อดู Network requests และ API responses

## License

Private project for Gongcha Queue Management System

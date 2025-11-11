// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { createServer } = require('http');
const WebSocket = require('ws');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const queueRoutes = require('./routes/queueRoutes');

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 10000;
const HOST = process.env.HOST || '0.0.0.0';

// ปิด perMessageDeflate ลด fragmentation + จำกัด payload กัน frame ใหญ่
const wss = new WebSocket.Server({
  server,
  perMessageDeflate: false,
  maxPayload: 256 * 1024, // 256KB
});

// เก็บ WebSocket connections แยกตาม restaurantId
const restaurantConnections = new Map();

// ---------- Middleware ----------
app.use(
  helmet({
    contentSecurityPolicy: false, // ปิด CSP ชั่วคราว (เช่น สำหรับ inline style/WS dev)
  })
);
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- Routes ----------
app.use('/api/queue', queueRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Queue Management API is running',
    timestamp: new Date().toISOString(),
  });
});

// ---------- WebSocket ----------
function heartbeat() { this.isAlive = true; }
const PING_INTERVAL_MS = 30_000; // ควรน้อยกว่า idle timeout ของ proxy/LB

function enableTcpKeepAlive(ws) {
  try {
    ws._socket.setKeepAlive(true, 60_000); // TCP keepalive ทุก 60s
    ws._socket.setNoDelay(true);           // ลด latency (ปิด Nagle)
  } catch (_) {}
}

wss.on('connection', (ws) => {
  console.log('🔌 WebSocket client connected');
  ws.isAlive = true;
  ws.on('pong', heartbeat);
  enableTcpKeepAlive(ws);

  ws.on('message', (message) => {
    try {
      // รองรับ app-level ping จาก client (กัน proxy บางตัวที่ drop control frames)
      if (message.toString() === 'ping') { ws.send('pong'); return; }

      const data = JSON.parse(message);

      if (data.type === 'join-restaurant' && data.restaurantId) {
        if (!restaurantConnections.has(data.restaurantId)) {
          restaurantConnections.set(data.restaurantId, new Set());
        }
        restaurantConnections.get(data.restaurantId).add(ws);
        ws.restaurantId = data.restaurantId;
        console.log(`👤 Client joined restaurant ${data.restaurantId}`);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', (code, reasonBuf) => {
    const reason = reasonBuf?.toString?.() || '';
    console.log(`🔌 WebSocket client disconnected (code=${code}, reason="${reason}")`);
    if (ws.restaurantId && restaurantConnections.has(ws.restaurantId)) {
      const set = restaurantConnections.get(ws.restaurantId);
      set.delete(ws);
      if (set.size === 0) restaurantConnections.delete(ws.restaurantId);
    }
  });

  ws.on('error', (error) => {
    console.error('🔌 WebSocket error:', error);
  });
});

// ping/pong เพื่อตัด connection ค้าง + กัน idle timeout
const wsInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (_) {}
  }
}, PING_INTERVAL_MS);

wss.on('close', () => clearInterval(wsInterval));

// ให้ routes เข้าถึง wss และ connection map ได้
app.set('wss', wss);
app.set('restaurantConnections', restaurantConnections);

// ---------- Error handlers (ต้องวางหลัง routes) ----------

// 404 – ต้องอยู่ท้ายก่อน error handler เสมอ และ "ไม่มี path"
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// 500 – central error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err.stack || err);
  res.status(500).json({
    error: 'Something went wrong!',
    message: err.message || 'Internal Server Error',
  });
});

// จัดการ promise ที่ไม่ถูกจับ เพื่อไม่ให้ process ล่มกะทันหัน
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

// ---------- HTTP server hardening ----------
server.keepAliveTimeout = 75_000; // > ping interval
server.headersTimeout   = 90_000;

// ---------- Start server ----------
server.on('error', (err) => {
  if (err.code === 'EACCES') {
    console.error(`❌ Permission denied on ${HOST}:${PORT}`);
    process.exit(1);
  } else if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port in use: ${HOST}:${PORT}`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`🚀 Queue Management API server running on http://${HOST}:${PORT}`);
  console.log(`📊 Health check: http://${HOST}:${PORT}/health`);
  console.log(`🔌 WebSocket server ready for real-time updates`);
});

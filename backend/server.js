// =====================================================
// Queue Management API Server (พร้อมระบบเสียงคิว Google TTS)
// =====================================================
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { createServer } = require('http');
const WebSocket = require('ws');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const queueRoutes = require('./routes/queueRoutes');

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 10001;
const HOST = process.env.HOST || '0.0.0.0';

// ปิด perMessageDeflate ลด fragmentation + จำกัด payload กัน frame ใหญ่
const wss = new WebSocket.Server({
  server,
  perMessageDeflate: false,
  maxPayload: 256 * 1024, // 256KB
});

// Store WebSocket connections by restaurant ID
const restaurantConnections = new Map();

app.use(express.json());
app.use(express.static("public"));

// ✅ Serve static files (index.html, tts, etc.)
app.use(express.static(path.join(__dirname, '../public')));

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Allow inline styles for now
  })
);
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/queue', queueRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Queue Management API is running',
    timestamp: new Date().toISOString(),
  });
});

// =========================================================
// ✅ ระบบเสียงคิวภาษาไทย (Google TTS + Cache + Force Option)
// =========================================================

// ✅ สร้างโฟลเดอร์ public/tts ถ้ายังไม่มี
const ttsDir = path.join(__dirname, '../public/tts');
if (!fs.existsSync(ttsDir)) {
  fs.mkdirSync(ttsDir, { recursive: true });
}

// ✅ ฟังก์ชันสร้างหรือใช้ไฟล์เสียงซ้ำ (Cache) พร้อม option force Y/N
async function callQueueVoice(queueText, forceDownload = "Y") {
  try {
    console.log(`📝 [Queue Voice] ข้อความที่ได้รับ: "${queueText}"`);

    // 🔍 ดึงรหัสคิว - ลองหลาย pattern
    // Pattern 1: K123, A456 (ตัวอักษร + ตัวเลข)
    let match = queueText.match(/[A-Za-z]\d+/);

    // Pattern 2: ถ้าไม่เจอ ลองหาแค่ตัวเลข 3 หลัก
    if (!match) {
      match = queueText.match(/\d{3}/);
    }

    // Pattern 3: ถ้ายังไม่เจอ ลองหาตัวเลขทั้งหมด
    if (!match) {
      match = queueText.match(/\d+/);
    }

    const queueId = match ? `K${match[0].replace(/[A-Za-z]/g, '')}` : "unknown";

    console.log(`🔍 [Queue Voice] Queue ID ที่แยกได้: "${queueId}"`);

    // ✅ Path เก็บไฟล์เสียง
    const ttsDir = path.join(process.cwd(), "public", "tts");
    await fs.promises.mkdir(ttsDir, { recursive: true });
    const filePath = path.join(ttsDir, `${queueId}.mp3`);

    // ✅ ถ้าไม่มีการบังคับโหลด (N) และไฟล์มีอยู่แล้ว → ใช้ไฟล์เดิม
    if (forceDownload === "N" && fs.existsSync(filePath)) {
      console.log(`⚡ [Queue Voice] พบไฟล์อยู่แล้ว: ${queueId}.mp3 → ใช้ไฟล์เดิม`);
      return `/tts/${path.basename(filePath)}`;
    }

    // ✅ โหลดใหม่จาก Google
    const encoded = encodeURIComponent(queueText);
    const googleTTSUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=th&client=tw-ob&q=${encoded}`;

    console.log(`🌐 [Queue Voice] โหลดเสียงใหม่จาก Google (${queueId})...`);
    console.log(`🌐 [Queue Voice] ข้อความที่ส่งไป Google: "${queueText}"`);
    console.log(`🌐 [Queue Voice] URL: ${googleTTSUrl.substring(0, 150)}...`);

    const response = await axios.get(googleTTSUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    // ✅ เขียนไฟล์ใหม่ (ทับเสมอ)
    await fs.promises.writeFile(filePath, buffer);
    console.log(`🔊 [Queue Voice] บันทึกไฟล์ใหม่: ${queueId}.mp3`);

    return `/tts/${path.basename(filePath)}`;
  } catch (err) {
    console.error("❌ [Queue Voice] สร้างเสียงล้มเหลว:", err);
    return null;
  }
}

// ✅ ให้ Express เสิร์ฟไฟล์เสียงในโฟลเดอร์ /public/tts
app.use('/tts', express.static(path.join(__dirname, '../public/tts')));


// ✅ API: สร้างหรือใช้ไฟล์เสียงเดิมตาม option Y/N
app.post("/api/callQueue", async (req, res) => {
  try {
    console.log(`📥 [API] Request body:`, req.body);
    const { queueText, force } = req.body;
    console.log(`📥 [API] queueText="${queueText}", force="${force}"`);
    if (!queueText) return res.status(400).json({ error: "Missing queueText" });

    // default = "N" ถ้าไม่ได้ส่งมา
    const forceDownload = force?.toUpperCase() === "Y" ? "Y" : "N";
    const url = await callQueueVoice(queueText, forceDownload);

    if (!url) return res.status(500).json({ error: "Failed to generate TTS" });
    res.json({ success: true, audioUrl: url, reloaded: forceDownload === "Y" });
  } catch (err) {
    console.error("❌ /api/callQueue error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ ทดสอบ endpoint (ตัวอย่าง mock)
// TODO: แทนที่ด้วยการดึงข้อมูลจาก database จริง
app.get("/rest/:restId", async (req, res) => {
  try {
    const { restId } = req.params;
    console.log(`📞 GET /rest/${restId} - Mock endpoint`);

    // Mock data สำหรับทดสอบ
    const result = [{ QueName: "K757" }];
    res.json(result);

    // สร้างไฟล์เสียงอัตโนมัติ
    const latest = result[0].QueName;
    if (latest) {
      const message = `คิว ${latest}`;
      await callQueueVoice(message);
    }
  } catch (error) {
    console.error('Error in /rest/:restId:', error);
    res.status(500).json({ error: error.message });
  }
});

// =========================================================
// WebSocket real-time queue updates
// =========================================================
wss.on('connection', (ws) => {
  console.log('🔌 WebSocket client connected');

  ws.on('message', (message) => {
    try {
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

  ws.on('close', () => {
    console.log('🔌 WebSocket client disconnected');

    if (ws.restaurantId && restaurantConnections.has(ws.restaurantId)) {
      restaurantConnections.get(ws.restaurantId).delete(ws);
      if (restaurantConnections.get(ws.restaurantId).size === 0) {
        restaurantConnections.delete(ws.restaurantId);
      }
    }
  });

  ws.on('error', (error) => {
    console.error('🔌 WebSocket error:', error);
  });
});

// Make WebSocket server available to routes
app.set('wss', wss);
app.set('restaurantConnections', restaurantConnections);

// =========================================================
// 404 handler
// =========================================================
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// =========================================================
// Server start
// =========================================================
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Queue Management API server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Accessible from any IP: http://0.0.0.0:${PORT}/health`);
  console.log(`🔌 WebSocket server ready for real-time updates`);
  console.log(`🔊 TTS API ready at /api/callQueue`);
});

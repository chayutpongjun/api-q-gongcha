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
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;

// Store WebSocket connections by restaurant ID
const restaurantConnections = new Map();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Allow inline styles for now
}));
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
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message
  });
});

// WebSocket real-time queue updates
wss.on('connection', (ws) => {
    console.log('🔌 WebSocket client connected');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'join-restaurant' && data.restaurantId) {
                // Store connection for this restaurant
                if (!restaurantConnections.has(data.restaurantId)) {
                    restaurantConnections.set(data.restaurantId, new Set());
                }
                restaurantConnections.get(data.restaurantId).add(ws);
                
                // Store restaurant ID on WebSocket for cleanup
                ws.restaurantId = data.restaurantId;
                
                console.log(`👤 Client joined restaurant ${data.restaurantId}`);
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('🔌 WebSocket client disconnected');
        
        // Clean up connection from restaurant groups
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

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Queue Management API server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Accessible from any IP: http://0.0.0.0:${PORT}/health`);
  console.log(`🔌 WebSocket server ready for real-time updates`);
});
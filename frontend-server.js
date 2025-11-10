const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.FRONTEND_PORT || 8080;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for restaurant routes
app.get('/rest/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Handle 404 - serve index.html for client-side routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Frontend server running on http://localhost:${PORT}`);
  console.log(`🌍 Accessible from any IP on port ${PORT}`);
  console.log(`📱 Visit: http://localhost:${PORT}/rest/1`);
  console.log(`📱 Or from any device: http://[YOUR_IP]:${PORT}/rest/1`);
});

server.on('error', (err) => {
  console.error('Frontend server error:', err);
});

// Keep the server running
process.on('SIGTERM', () => {
  console.log('Frontend server shutting down...');
  server.close();
});

process.on('SIGINT', () => {
  console.log('Frontend server shutting down...');
  server.close();
});
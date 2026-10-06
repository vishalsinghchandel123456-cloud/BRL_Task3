 
require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const connectDB = require('./db');
const { initSocket } = require('./socket');
const rateLimit = require('./middleware/rateLimit');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const conversationRoutes = require('./routes/conversationRoutes');

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy; needed for req.ip in rate limiting

app.use(express.json());

// Allow the frontend (Vercel in production, Vite locally) to call this API.
app.use(
  cors({
    origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  })
);

// Basic security headers (no extra dependency needed for this).
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});

connectDB();

// Health check for Render / uptime monitors.
app.get('/health', (req, res) => res.json({ success: true, status: 'ok' }));

// Brute-force protection on login/register.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });

app.use('/auth', authLimiter, authRoutes);
app.use('/users', userRoutes);
app.use('/conversations', conversationRoutes);

// 404 for unknown API routes.
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Central error handler — details stay in the logs, never in the response.
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Something went wrong' });
});

// Use PORT from the environment when it's a valid positive integer
// (Render assigns one); otherwise fall back to 5000.
const envPort = parseInt(process.env.PORT, 10);
const PORT = Number.isInteger(envPort) && envPort > 0 ? envPort : 5000;
const server = http.createServer(app);
initSocket(server); // WebSockets share the same HTTP server/port as the REST API

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

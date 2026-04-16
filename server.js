const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const { db, seed } = require('./db');
const { JWT_SECRET } = require('./middleware/auth');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Make io accessible to routes
app.io = io;

// Middleware
app.use(cors());
app.use(express.json());
// Disable cache for HTML, allow short cache for assets
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/experts', require('./routes/experts'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/reservations', require('./routes/reservations'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/community', require('./routes/community'));
app.use('/api/bookmarks', require('./routes/bookmarks'));
app.use('/api/phrases', require('./routes/phrases'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/search', require('./routes/search'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/upload', require('./routes/upload'));

// Socket.io for real-time chat
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user.id}`);

  socket.on('join_room', (roomId) => {
    socket.join('room:' + roomId);
  });

  socket.on('leave_room', (roomId) => {
    socket.leave('room:' + roomId);
  });

  socket.on('typing', (roomId) => {
    socket.to('room:' + roomId).emit('user_typing', { userId: socket.user.id });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.user.id}`);
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Seed database
seed();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  Graddy server running at http://localhost:${PORT}\n`);
});

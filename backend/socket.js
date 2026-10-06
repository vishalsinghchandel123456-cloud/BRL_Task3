 
const jwt = require('jsonwebtoken');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');

let io = null;
// userId -> Set of socket ids (a user may have several tabs/devices open)
const onlineUsers = new Map();

function getIO() {
  return io;
}

function isOnline(userId) {
  return onlineUsers.has(String(userId));
}

function socketsFor(userId) {
  return onlineUsers.get(String(userId)) || new Set();
}

// Deliver a payload to every open socket of one user.
function emitToUser(userId, event, payload) {
  if (!io) return;
  for (const socketId of socketsFor(userId)) {
    io.to(socketId).emit(event, payload);
  }
}

function setOnline(userId, socketId) {
  const key = String(userId);
  if (!onlineUsers.has(key)) onlineUsers.set(key, new Set());
  onlineUsers.get(key).add(socketId);
}

function removeSocket(userId, socketId) {
  const key = String(userId);
  const sockets = onlineUsers.get(key);
  if (!sockets) return false;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    onlineUsers.delete(key);
    return true; // user fully disconnected
  }
  return false;
}

function initSocket(httpServer) {
  const { Server } = require('socket.io');

  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : true,
      methods: ['GET', 'POST'],
    },
  });

  // --- handshake authentication -------------------------------------
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('No token provided'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  // --- connection lifecycle ----------------------------------------
  io.on('connection', (socket) => {
    const userId = String(socket.userId);
    setOnline(userId, socket.id);
    if (socketsFor(userId).size === 1) {
      io.emit('presence:update', { userId, online: true }); // announce only on first tab
    }

    // --- who is online right now? ------------------------------------
    socket.on('presence:list', () => {
      socket.emit('presence:list', [...onlineUsers.keys()]);
    });

    // --- sending a message -------------------------------------------
    // payload: { conversationId, content }
    socket.on('message:send', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const conversationId = payload && payload.conversationId;
        const content = payload && typeof payload.content === 'string' ? payload.content.trim() : '';

        if (!conversationId || !content) {
          return reply({ success: false, message: 'conversationId and content are required' });
        }
        if (content.length > 2000) {
          return reply({ success: false, message: 'Message is too long (max 2000 characters)' });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          return reply({ success: false, message: 'Conversation not found' });
        }
        // authorization over the socket, same rule as the REST API:
        if (!conversation.participants.some((p) => String(p) === userId)) {
          return reply({ success: false, message: 'You are not a participant of this conversation' });
        }

        const message = await Message.create({
          conversation: conversation._id,
          sender: socket.userId,
          content,
        });
        await message.populate('sender', 'name email');

        // keep the conversation list sorted by real activity
        conversation.lastMessage = message._id;
        conversation.updatedAt = new Date();
        await conversation.save();

        const eventPayload = {
          message,
          conversationId: String(conversation._id),
        };
        // to everyone in the chat (all their tabs) + participants' other devices
        for (const participantId of conversation.participants) {
          for (const sid of socketsFor(participantId)) {
            io.to(sid).emit('message:new', eventPayload);
          }
        }
        reply({ success: true, message });
      } catch (err) {
        console.error('message:send error:', err.message);
        reply({ success: false, message: 'Failed to send message' });
      }
    });

    // --- disconnect ---------------------------------------------------
    socket.on('disconnect', () => {
      const wasFullyOffline = removeSocket(userId, socket.id);
      if (wasFullyOffline) {
        io.emit('presence:update', { userId, online: false });
      }
    });
  });

  return io;
}

module.exports = { initSocket, getIO, emitToUser, isOnline };

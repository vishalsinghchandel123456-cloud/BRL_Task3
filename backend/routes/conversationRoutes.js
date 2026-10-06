 
const express = require('express');
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const requireAuth = require('../middleware/auth');
const { emitToUser, isOnline } = require('../socket');

const router = express.Router();

// Every route below requires a valid JWT.
router.use(requireAuth);
 
function populatedConversation(conversationId) {
  return Conversation.findById(conversationId)
    .populate('participants', 'name email createdAt')
    .populate('lastMessage');
}

// GET /conversations  (protected)
// All conversations the current user belongs to, newest activity first.
router.get('/', async (req, res) => {
  try {
    const conversations = await Conversation.find({ participants: req.userId })
      .populate('participants', 'name email createdAt')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });

    res.status(200).json({ success: true, conversations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
 
router.post('/', async (req, res) => {
  try {
    const { receiverId } = req.body;

    if (!receiverId) {
      return res.status(400).json({ success: false, message: 'receiverId is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({ success: false, message: 'Invalid receiverId format' });
    }
    if (String(receiverId) === String(req.userId)) {
      return res.status(400).json({ success: false, message: 'You cannot start a conversation with yourself' });
    }

    const pair = [req.userId, receiverId].sort(); // canonical order -> one conversation per pair
    const pairKey = Conversation.buildPairKey(req.userId, receiverId);

    let conversation = await Conversation.findOne({ pairKey });
    let created = false;

    if (!conversation) {
      // guard against a race where both users click each other at once
      try {
        conversation = await Conversation.create({ participants: pair, pairKey });
        created = true;
      } catch (err) {
        if (err.code !== 11000) throw err;
        conversation = await Conversation.findOne({ pairKey });
      }
    }

    if (!conversation) {
      return res.status(500).json({ success: false, message: 'Could not create conversation' });
    }

    const full = await populatedConversation(conversation._id);

    // Tell the other person in real time that a chat now exists,
    // so their sidebar updates without a refresh.
    if (created) {
      emitToUser(receiverId, 'conversation:new', { conversation: full });
    }

    res.status(created ? 201 : 200).json({ success: true, conversation: full });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /conversations/:id  (protected, participant only)
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid conversation id' });
    }

    const conversation = await populatedConversation(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }
    if (!conversation.participants.some((p) => String(p._id) === String(req.userId))) {
      return res.status(403).json({ success: false, message: 'You are not a participant of this conversation' });
    }

    res.status(200).json({ success: true, conversation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /conversations/:id/messages  (protected, participant only)
// Query params (optional): ?limit=50&before=<ISO date> for paging older history.
router.get('/:id/messages', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid conversation id' });
    }

    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }
    const isParticipant = conversation.participants.some(
      (p) => String(p) === String(req.userId)
    );
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'You are not a participant of this conversation' });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const filter = { conversation: conversation._id };
    if (req.query.before) {
      const beforeDate = new Date(req.query.before);
      if (isNaN(beforeDate.getTime())) {
        return res.status(400).json({ success: false, message: 'before must be an ISO date' });
      }
      filter.createdAt = { $lt: beforeDate };
    }

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 }) // newest first...
      .limit(limit)
      .populate('sender', 'name email');

    res.status(200).json({ success: true, messages: messages.reverse() }); // ...then reversed for display
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

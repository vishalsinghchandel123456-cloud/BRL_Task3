 
const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ],
    pairKey: { type: String, required: true, unique: true },
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  },
  { timestamps: true }
);

// Helper: build the canonical key for any two user ids.
conversationSchema.statics.buildPairKey = function (a, b) {
  return [String(a), String(b)].sort().join('_');
};

module.exports = mongoose.model('Conversation', conversationSchema);

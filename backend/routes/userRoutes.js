 
const express = require('express');
const User = require('../models/User');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// GET /users  (protected)
router.get('/', requireAuth, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.userId } }) // everyone except myself
      .select('name email createdAt')
      .sort({ name: 1 })
      .limit(100);

    res.status(200).json({ success: true, users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

const express = require('express');
const { db } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications
router.get('/', authRequired, (req, res) => {
  const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id).c;
  res.json({ notifications, unread });
});

// PUT /api/notifications/read-all
router.put('/read-all', authRequired, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ success: true });
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authRequired, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

module.exports = router;

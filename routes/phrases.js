const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// GET /api/phrases
router.get('/', authRequired, (req, res) => {
  const phrases = db.prepare('SELECT * FROM phrases WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ phrases });
});

// POST /api/phrases
router.post('/', authRequired, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: '문구를 입력해주세요.' });
  const id = uuid();
  db.prepare('INSERT INTO phrases (id, user_id, text) VALUES (?,?,?)').run(id, req.user.id, text.trim());
  const phrase = db.prepare('SELECT * FROM phrases WHERE id = ?').get(id);
  res.json({ phrase });
});

// DELETE /api/phrases/:id
router.delete('/:id', authRequired, (req, res) => {
  db.prepare('DELETE FROM phrases WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

module.exports = router;

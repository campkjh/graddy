const express = require('express');
const { db } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// GET /api/bookmarks
router.get('/', authRequired, (req, res) => {
  const bookmarks = db.prepare(`
    SELECT ep.*, u.name, u.major, u.career_years, u.verified, u.profile_image, b.created_at as bookmarked_at
    FROM bookmarks b
    JOIN expert_profiles ep ON b.expert_id = ep.id
    JOIN users u ON ep.user_id = u.id
    WHERE b.user_id = ?
    ORDER BY b.created_at DESC
  `).all(req.user.id);

  bookmarks.forEach(b => { b.tags = JSON.parse(b.tags || '[]'); b.is_bookmarked = true; });
  res.json({ bookmarks });
});

// POST /api/bookmarks/:expertId
router.post('/:expertId', authRequired, (req, res) => {
  const expertId = req.params.expertId;
  const existing = db.prepare('SELECT 1 FROM bookmarks WHERE user_id = ? AND expert_id = ?').get(req.user.id, expertId);
  if (existing) {
    db.prepare('DELETE FROM bookmarks WHERE user_id = ? AND expert_id = ?').run(req.user.id, expertId);
    res.json({ bookmarked: false });
  } else {
    db.prepare('INSERT INTO bookmarks (user_id, expert_id) VALUES (?,?)').run(req.user.id, expertId);
    res.json({ bookmarked: true });
  }
});

module.exports = router;

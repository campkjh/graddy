const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// POST /api/reviews
router.post('/', authRequired, (req, res) => {
  const { expert_id, reservation_id, rating, content } = req.body;
  if (!expert_id || !rating) return res.status(400).json({ error: '평점을 입력해주세요.' });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: '평점은 1~5 사이여야 합니다.' });

  const id = uuid();
  db.prepare('INSERT INTO reviews (id, reservation_id, reviewer_id, expert_id, rating, content) VALUES (?,?,?,?,?,?)').run(
    id, reservation_id || null, req.user.id, expert_id, rating, content || ''
  );

  // Update expert rating
  const stats = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as cnt FROM reviews WHERE expert_id = ?').get(expert_id);
  db.prepare('UPDATE expert_profiles SET rating = ?, review_count = ? WHERE id = ?').run(
    Math.round(stats.avg * 10) / 10, stats.cnt, expert_id
  );

  const review = db.prepare('SELECT r.*, u.name as reviewer_name FROM reviews r JOIN users u ON r.reviewer_id = u.id WHERE r.id = ?').get(id);
  res.json({ review });
});

module.exports = router;

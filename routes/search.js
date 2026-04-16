const express = require('express');
const { db } = require('../db');
const { authOptional } = require('../middleware/auth');

const router = express.Router();

// GET /api/search
router.get('/', authOptional, (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 1) return res.json({ experts: [], posts: [] });

  const term = `%${q.trim()}%`;

  const experts = db.prepare(`
    SELECT ep.*, u.name, u.major, u.career_years, u.verified, u.profile_image
    FROM expert_profiles ep
    JOIN users u ON ep.user_id = u.id
    WHERE ep.title LIKE ? OR u.name LIKE ? OR ep.category LIKE ? OR ep.hashtags LIKE ? OR u.major LIKE ?
    ORDER BY ep.rating DESC
    LIMIT 10
  `).all(term, term, term, term, term);

  experts.forEach(e => { e.tags = JSON.parse(e.tags || '[]'); });

  const posts = db.prepare(`
    SELECT p.*, u.name as author_name,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count
    FROM posts p JOIN users u ON p.user_id = u.id
    WHERE p.title LIKE ? OR p.body LIKE ?
    ORDER BY p.created_at DESC
    LIMIT 10
  `).all(term, term);

  res.json({ experts, posts });
});

module.exports = router;

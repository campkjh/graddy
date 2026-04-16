const express = require('express');
const { db } = require('../db');
const { authOptional } = require('../middleware/auth');

const router = express.Router();

// GET /api/experts - list experts with filters
router.get('/', authOptional, (req, res) => {
  const { category, sort, q, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = [];
  let params = [];

  if (category && category !== '전체') {
    where.push('ep.category = ?');
    params.push(category);
  }
  if (q) {
    where.push('(ep.title LIKE ? OR u.name LIKE ? OR ep.hashtags LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  let orderBy = 'ep.created_at DESC';
  if (sort === 'rating') orderBy = 'ep.rating DESC';
  else if (sort === 'reviews') orderBy = 'ep.review_count DESC';
  else if (sort === 'price_low') orderBy = 'ep.price_per_30min ASC';
  else if (sort === 'price_high') orderBy = 'ep.price_per_30min DESC';
  else if (sort === 'orders') orderBy = 'ep.order_count DESC';

  const total = db.prepare(`SELECT COUNT(*) as c FROM expert_profiles ep JOIN users u ON ep.user_id = u.id ${whereClause}`).get(...params).c;

  const items = db.prepare(`
    SELECT ep.*, u.name, u.major, u.career_years, u.verified, u.profile_image,
      (SELECT COUNT(*) FROM bookmarks b WHERE b.expert_id = ep.id) as bookmark_count
    FROM expert_profiles ep
    JOIN users u ON ep.user_id = u.id
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset));

  const result = items.map(it => ({
    ...it,
    tags: JSON.parse(it.tags || '[]'),
    is_bookmarked: req.user ? !!db.prepare('SELECT 1 FROM bookmarks WHERE user_id = ? AND expert_id = ?').get(req.user.id, it.id) : false
  }));

  res.json({ items: result, total, page: Number(page), pages: Math.ceil(total / limit) });
});

// GET /api/experts/:id - expert detail
router.get('/:id', authOptional, (req, res) => {
  const expert = db.prepare(`
    SELECT ep.*, u.name, u.major, u.career_years, u.verified, u.profile_image, u.bio, u.id as user_id
    FROM expert_profiles ep
    JOIN users u ON ep.user_id = u.id
    WHERE ep.id = ?
  `).get(req.params.id);

  if (!expert) return res.status(404).json({ error: '전문가를 찾을 수 없습니다.' });

  const packages = db.prepare('SELECT * FROM packages WHERE expert_id = ? ORDER BY sort_order').all(req.params.id);
  const reviews = db.prepare(`
    SELECT r.*, u.name as reviewer_name, u.profile_image as reviewer_image
    FROM reviews r JOIN users u ON r.reviewer_id = u.id
    WHERE r.expert_id = ? ORDER BY r.created_at DESC LIMIT 10
  `).all(req.params.id);

  // Rating distribution
  const dist = db.prepare(`
    SELECT rating, COUNT(*) as cnt FROM reviews WHERE expert_id = ? GROUP BY rating
  `).all(req.params.id);
  const ratingDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  dist.forEach(d => { ratingDist[d.rating] = d.cnt; });

  expert.tags = JSON.parse(expert.tags || '[]');
  expert.is_bookmarked = req.user ? !!db.prepare('SELECT 1 FROM bookmarks WHERE user_id = ? AND expert_id = ?').get(req.user.id, expert.id) : false;

  packages.forEach(p => { p.features = JSON.parse(p.features || '[]'); });

  res.json({ expert, packages, reviews, ratingDist });
});

// GET /api/experts/categories/list
router.get('/categories/list', (req, res) => {
  const cats = db.prepare(`
    SELECT category, COUNT(*) as count FROM expert_profiles GROUP BY category ORDER BY count DESC
  `).all();
  res.json({ categories: ['전체', ...cats.map(c => c.category)], counts: cats });
});

module.exports = router;

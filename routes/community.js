const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { authRequired, authOptional } = require('../middleware/auth');

const router = express.Router();

// GET /api/community/posts
router.get('/posts', authOptional, (req, res) => {
  const { category, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = '';
  const params = [];
  if (category && category !== '전체') {
    where = 'WHERE p.category = ?';
    params.push(category);
  }
  const total = db.prepare(`SELECT COUNT(*) as c FROM posts p ${where}`).get(...params).c;
  const posts = db.prepare(`
    SELECT p.*, u.name as author_name, u.profile_image as author_image,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count
    FROM posts p
    JOIN users u ON p.user_id = u.id
    ${where}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset));

  posts.forEach(p => {
    p.is_liked = req.user ? !!db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?').get(req.user.id, p.id) : false;
  });

  res.json({ posts, total, page: Number(page) });
});

// GET /api/community/posts/:id
router.get('/posts/:id', authOptional, (req, res) => {
  const post = db.prepare(`
    SELECT p.*, u.name as author_name, u.profile_image as author_image,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count
    FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = ?
  `).get(req.params.id);
  if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });

  // Increment views
  db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(req.params.id);
  post.views += 1;

  const comments = db.prepare(`
    SELECT c.*, u.name as author_name, u.profile_image as author_image
    FROM comments c JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `).all(req.params.id);

  post.is_liked = req.user ? !!db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?').get(req.user.id, post.id) : false;

  res.json({ post, comments });
});

// POST /api/community/posts
router.post('/posts', authRequired, (req, res) => {
  const { title, body, category } = req.body;
  if (!title) return res.status(400).json({ error: '제목을 입력해주세요.' });
  const id = uuid();
  db.prepare('INSERT INTO posts (id, user_id, category, title, body) VALUES (?,?,?,?,?)').run(
    id, req.user.id, category || '질문', title, body || ''
  );
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  res.json({ post });
});

// PUT /api/community/posts/:id
router.put('/posts/:id', authRequired, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  const { title, body, category } = req.body;
  db.prepare('UPDATE posts SET title = ?, body = ?, category = ? WHERE id = ?').run(
    title || post.title, body ?? post.body, category || post.category, req.params.id
  );
  res.json({ success: true });
});

// DELETE /api/community/posts/:id
router.delete('/posts/:id', authRequired, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/community/posts/:id/comments
router.post('/posts/:id/comments', authRequired, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: '댓글을 입력해주세요.' });
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  const id = uuid();
  db.prepare('INSERT INTO comments (id, post_id, user_id, content) VALUES (?,?,?,?)').run(id, req.params.id, req.user.id, content);

  // Notify post author
  if (post.user_id !== req.user.id) {
    const commenterName = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id)?.name;
    db.prepare('INSERT INTO notifications (id, user_id, title, body, type, ref_id) VALUES (?,?,?,?,?,?)').run(
      uuid(), post.user_id, '새 댓글', `${commenterName}님이 댓글을 남겼습니다.`, 'community', req.params.id
    );
  }

  const comment = db.prepare('SELECT c.*, u.name as author_name, u.profile_image as author_image FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(id);
  res.json({ comment });
});

// POST /api/community/posts/:id/like
router.post('/posts/:id/like', authRequired, (req, res) => {
  const existing = db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?').get(req.user.id, req.params.id);
  if (existing) {
    db.prepare('DELETE FROM likes WHERE user_id = ? AND post_id = ?').run(req.user.id, req.params.id);
    res.json({ liked: false });
  } else {
    db.prepare('INSERT INTO likes (user_id, post_id) VALUES (?,?)').run(req.user.id, req.params.id);
    res.json({ liked: true });
  }
  const count = db.prepare('SELECT COUNT(*) as c FROM likes WHERE post_id = ?').get(req.params.id).c;
  res.json({ liked: !existing, count });
});

module.exports = router;

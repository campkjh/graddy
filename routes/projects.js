const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// GET /api/projects
router.get('/', authRequired, (req, res) => {
  const { status } = req.query;
  let where = 'p.client_id = ?';
  const params = [req.user.id];
  if (status && status !== 'all') {
    where += ' AND p.status = ?';
    params.push(status);
  }
  const projects = db.prepare(`
    SELECT p.*, eu.name as expert_name, eu.profile_image as expert_image
    FROM projects p
    LEFT JOIN users eu ON p.expert_id = eu.id
    WHERE ${where}
    ORDER BY p.created_at DESC
  `).all(...params);
  res.json({ projects });
});

// POST /api/projects
router.post('/', authRequired, (req, res) => {
  const { title, description, category, budget } = req.body;
  if (!title) return res.status(400).json({ error: '프로젝트 제목을 입력해주세요.' });
  const id = uuid();
  db.prepare('INSERT INTO projects (id, client_id, title, description, category, budget) VALUES (?,?,?,?,?,?)').run(
    id, req.user.id, title, description || '', category || '', budget || ''
  );
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.json({ project });
});

// PUT /api/projects/:id
router.put('/:id', authRequired, (req, res) => {
  const prj = db.prepare('SELECT * FROM projects WHERE id = ? AND client_id = ?').get(req.params.id, req.user.id);
  if (!prj) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
  const { title, description, category, budget } = req.body;
  db.prepare('UPDATE projects SET title = ?, description = ?, category = ?, budget = ? WHERE id = ?').run(
    title || prj.title, description ?? prj.description, category || prj.category, budget || prj.budget, req.params.id
  );
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  res.json({ project });
});

// DELETE /api/projects/:id
router.delete('/:id', authRequired, (req, res) => {
  const prj = db.prepare('SELECT * FROM projects WHERE id = ? AND client_id = ?').get(req.params.id, req.user.id);
  if (!prj) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'graddy-secret-key-change-in-production';
const JWT_EXPIRES = '7d';

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: '인증이 만료되었습니다. 다시 로그인해주세요.' });
  }
}

function authOptional(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    } catch { /* ignore */ }
  }
  next();
}

module.exports = { generateToken, authRequired, authOptional, JWT_SECRET };

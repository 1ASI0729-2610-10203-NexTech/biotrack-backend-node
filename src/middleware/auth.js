const jwt = require('jsonwebtoken')
const pool = require('../config/db')

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization header.' })
  }
  const token = authHeader.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [payload.sub])
    if (!rows.length) return res.status(401).json({ message: 'User not found.' })
    req.user = rows[0]
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' })
  }
}

module.exports = authenticate

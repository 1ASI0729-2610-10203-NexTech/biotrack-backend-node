const router = require('express').Router()
const pool = require('../config/db')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

// POST /api/v1/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' })
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()])
    if (!rows.length) return res.status(400).json({ message: 'Invalid credentials.' })

    const user = rows[0]
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return res.status(400).json({ message: 'Invalid credentials.' })

    const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' })

    res.json({
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      role: user.role,
      emailVerified: user.email_verified,
      status: user.status,
      token,
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/auth/verify-email?token=...
router.get('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.query
    if (!token) return res.status(400).json({ message: 'Token is required.' })

    const { rows } = await pool.query('SELECT * FROM users WHERE verification_token = $1', [token])
    if (!rows.length) return res.status(400).json({ message: 'Invalid or expired token.' })

    const user = rows[0]
    if (user.email_verified) return res.status(400).json({ message: 'Email already verified.' })

    await pool.query(
      "UPDATE users SET email_verified = true, status = 'ACTIVE', verification_token = NULL WHERE id = $1",
      [user.id],
    )

    res.json({ message: 'Email verified successfully.' })
  } catch (err) {
    next(err)
  }
})

module.exports = router

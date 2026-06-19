const router = require('express').Router()
const pool = require('../config/db')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const authenticate = require('../middleware/auth')

function formatUser(u) {
  return {
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    email: u.email,
    role: u.role,
    emailVerified: u.email_verified,
    status: u.status,
  }
}

// POST /api/v1/users/register
router.post('/register', async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, role } = req.body
    if (!firstName || !lastName || !email || !password || !role) {
      return res.status(400).json({ message: 'All fields are required.' })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail])
    if (existing.rows.length) return res.status(409).json({ message: 'Email already registered.' })

    const passwordHash = await bcrypt.hash(password, 10)
    const verificationToken = crypto.randomUUID()

    await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, email_verified, status, verification_token)
       VALUES ($1, $2, $3, $4, $5, false, 'PENDING', $6)`,
      [firstName, lastName, normalizedEmail, passwordHash, role, verificationToken],
    )

    res.status(201).json({ message: 'User registered successfully.' })
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/users/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id])
    if (!rows.length) return res.status(404).json({ message: 'User not found.' })
    res.json(formatUser(rows[0]))
  } catch (err) {
    next(err)
  }
})

module.exports = router

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
       VALUES ($1, $2, $3, $4, $5, true, 'ACTIVE', $6)`,
      [firstName, lastName, normalizedEmail, passwordHash, role, verificationToken],
    )

    res.status(201).json({ message: 'User registered successfully.' })
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/users/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id])
    if (!rows.length) return res.status(404).json({ message: 'User not found.' })
    res.json(formatUser(rows[0]))
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/users/patients  — pacientes asignados al nutricionista autenticado
router.get('/patients', authenticate, async (req, res, next) => {
  try {
    const role = req.user.role
    if (role !== 'NUTRICIONISTA' && role !== 'NUTRITIONIST') {
      return res.status(403).json({ message: 'Only nutritionists can access this endpoint.' })
    }

    const { rows } = await pool.query(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, u.role, u.status,
              hp.weight_kg, hp.height_cm, hp.nutritional_objective, hp.activity_level
       FROM plan_assignments pa
       JOIN users u ON u.id = pa.patient_id
       LEFT JOIN health_profiles hp ON hp.user_id = pa.patient_id
       WHERE pa.nutritionist_id = $1
       ORDER BY u.first_name ASC`,
      [req.user.id],
    )

    res.json(rows.map((u) => ({
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      email: u.email,
      role: u.role,
      status: u.status,
      weightKg: u.weight_kg ? parseFloat(u.weight_kg) : null,
      heightCm: u.height_cm ? parseFloat(u.height_cm) : null,
      nutritionalObjective: u.nutritional_objective ?? null,
      activityLevel: u.activity_level ?? null,
    })))
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

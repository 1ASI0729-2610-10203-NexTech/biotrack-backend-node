const router = require('express').Router()
const pool = require('../config/db')
const authenticate = require('../middleware/auth')

pool.query(`
  CREATE TABLE IF NOT EXISTS consultations (
    id SERIAL PRIMARY KEY,
    nutritionist_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    consultation_date DATE NOT NULL,
    topic VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch((err) => console.error('consultations table init error:', err.message))

router.use(authenticate)

// GET /api/v1/consultations
router.get('/', async (req, res, next) => {
  try {
    const role = req.user.role
    const isNutritionist = role === 'NUTRICIONISTA' || role === 'NUTRITIONIST'

    if (isNutritionist) {
      const { rows } = await pool.query(
        `SELECT c.*, u.first_name, u.last_name, u.email
         FROM consultations c
         JOIN users u ON u.id = c.patient_id
         WHERE c.nutritionist_id = $1
         ORDER BY c.consultation_date DESC, c.created_at DESC`,
        [req.user.id],
      )
      return res.json({
        role: 'nutritionist',
        consultations: rows.map((r) => ({
          id: r.id,
          patientId: r.patient_id,
          patientName: `${r.first_name} ${r.last_name}`,
          patientEmail: r.email,
          date: r.consultation_date ? new Date(r.consultation_date).toISOString().slice(0, 10) : null,
          topic: r.topic,
          notes: r.notes,
          createdAt: r.created_at,
        })),
      })
    }

    const { rows } = await pool.query(
      `SELECT c.*, u.first_name, u.last_name
       FROM consultations c
       JOIN users u ON u.id = c.nutritionist_id
       WHERE c.patient_id = $1
       ORDER BY c.consultation_date DESC, c.created_at DESC`,
      [req.user.id],
    )
    res.json({
      role: 'patient',
      consultations: rows.map((r) => ({
        id: r.id,
        nutritionistName: `${r.first_name} ${r.last_name}`,
        date: r.consultation_date ? new Date(r.consultation_date).toISOString().slice(0, 10) : null,
        topic: r.topic,
        notes: r.notes,
        createdAt: r.created_at,
      })),
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/consultations
router.post('/', async (req, res, next) => {
  try {
    const role = req.user.role
    if (role !== 'NUTRICIONISTA' && role !== 'NUTRITIONIST') {
      return res.status(403).json({ message: 'Only nutritionists can create consultations.' })
    }
    const { patientId, date, topic, notes } = req.body
    if (!patientId || !date) {
      return res.status(400).json({ message: 'patientId and date are required.' })
    }
    const { rows } = await pool.query(
      `INSERT INTO consultations (nutritionist_id, patient_id, consultation_date, topic, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, patientId, date, topic || null, notes || null],
    )
    const r = rows[0]
    res.status(201).json({
      id: r.id,
      patientId: r.patient_id,
      date: r.consultation_date ? new Date(r.consultation_date).toISOString().slice(0, 10) : null,
      topic: r.topic,
      notes: r.notes,
      createdAt: r.created_at,
    })
  } catch (err) {
    next(err)
  }
})

module.exports = router

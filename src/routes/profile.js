const router = require('express').Router()
const pool = require('../config/db')
const authenticate = require('../middleware/auth')

router.use(authenticate)

function calcBMI(weightKg, heightCm) {
  if (!weightKg || !heightCm || heightCm === 0) return 0
  const hm = heightCm / 100
  return Math.round((weightKg / (hm * hm)) * 10) / 10
}

function calcCalorieTarget(activityLevel, nutritionalObjective) {
  const base = 2000
  const actMult = { LOW: 1.0, MODERATE: 1.3, HIGH: 1.6 }
  const objAdj = { LOSE_WEIGHT: -300, MAINTAIN_WEIGHT: 0, GAIN_MUSCLE: 300 }
  return Math.round(base * (actMult[activityLevel] ?? 1) + (objAdj[nutritionalObjective] ?? 0))
}

function formatProfile(row) {
  return {
    id: row.id,
    userId: row.user_id,
    heightCm: row.height_cm,
    weightKg: row.weight_kg,
    goalWeightKg: row.goal_weight_kg,
    bmi: row.bmi,
    activityLevel: row.activity_level,
    nutritionalObjective: row.nutritional_objective,
    dietaryRestrictions: row.dietary_restrictions ?? '',
    updatedAt: row.updated_at,
  }
}

// GET /api/v1/profile
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM health_profiles WHERE user_id = $1', [req.user.id])
    if (!rows.length) {
      return res.status(404).json({ message: 'Health profile not found. Please update your health data first.' })
    }
    res.json(formatProfile(rows[0]))
  } catch (err) {
    next(err)
  }
})

// PUT /api/v1/profile/health-data
router.put('/health-data', async (req, res, next) => {
  try {
    const { heightCm, weightKg, goalWeightKg, activityLevel, nutritionalObjective } = req.body
    const bmi = calcBMI(weightKg, heightCm)

    const { rows } = await pool.query(
      `INSERT INTO health_profiles (user_id, height_cm, weight_kg, goal_weight_kg, bmi, activity_level, nutritional_objective, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         height_cm = EXCLUDED.height_cm,
         weight_kg = EXCLUDED.weight_kg,
         goal_weight_kg = EXCLUDED.goal_weight_kg,
         bmi = EXCLUDED.bmi,
         activity_level = EXCLUDED.activity_level,
         nutritional_objective = EXCLUDED.nutritional_objective,
         updated_at = NOW()
       RETURNING *`,
      [req.user.id, heightCm, weightKg, goalWeightKg, bmi, activityLevel, nutritionalObjective],
    )
    res.json(formatProfile(rows[0]))
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/profile/nutritional-goals
router.get('/nutritional-goals', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM health_profiles WHERE user_id = $1', [req.user.id])
    if (!rows.length) return res.status(404).json({ message: 'Health profile not found.' })

    const profile = rows[0]
    const cal = calcCalorieTarget(profile.activity_level, profile.nutritional_objective)
    const protein = Math.round((cal * 0.30) / 4)
    const carbs = Math.round((cal * 0.45) / 4)
    const fat = Math.round((cal * 0.25) / 9)

    res.json({
      userId: req.user.id,
      bmi: profile.bmi,
      goals: [
        { type: 'Calories', target: cal, unit: 'kcal' },
        { type: 'Protein', target: protein, unit: 'g' },
        { type: 'Carbohydrates', target: carbs, unit: 'g' },
        { type: 'Fat', target: fat, unit: 'g' },
      ],
    })
  } catch (err) {
    next(err)
  }
})

// PUT /api/v1/profile/restrictions
router.put('/restrictions', async (req, res, next) => {
  try {
    const { restrictions } = req.body
    const { rows } = await pool.query(
      'UPDATE health_profiles SET dietary_restrictions = $1, updated_at = NOW() WHERE user_id = $2 RETURNING *',
      [restrictions, req.user.id],
    )
    if (!rows.length) return res.status(404).json({ message: 'Health profile not found.' })
    res.json(formatProfile(rows[0]))
  } catch (err) {
    next(err)
  }
})

module.exports = router

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
  const w = parseFloat(row.weight_kg) || 0
  const h = parseFloat(row.height_cm) || 0
  return {
    id: row.id,
    userId: row.user_id,
    heightCm: h,
    weightKg: w,
    goalWeightKg: row.goal_weight_kg != null ? parseFloat(row.goal_weight_kg) : null,
    bmi: calcBMI(w, h),
    activityLevel: row.activity_level,
    nutritionalObjective: row.nutritional_objective,
    dietaryRestrictions: row.dietary_restrictions ?? '',
    restrictionsConfirmed: row.dietary_restrictions !== null && row.dietary_restrictions !== undefined,
    age: row.age != null ? Number(row.age) : null,
    biologicalSex: row.biological_sex ?? null,
    systolicPressure: row.systolic_pressure != null ? Number(row.systolic_pressure) : null,
    diastolicPressure: row.diastolic_pressure != null ? Number(row.diastolic_pressure) : null,
    glucoseMgDl: row.glucose_mg_dl != null ? parseFloat(row.glucose_mg_dl) : null,
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
    const {
      heightCm, weightKg, goalWeightKg, activityLevel, nutritionalObjective,
      age, biologicalSex, systolicPressure, diastolicPressure, glucoseMgDl,
    } = req.body

    const { rows } = await pool.query(
      `INSERT INTO health_profiles
         (user_id, height_cm, weight_kg, goal_weight_kg, activity_level, nutritional_objective,
          age, biological_sex, systolic_pressure, diastolic_pressure, glucose_mg_dl,
          created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         height_cm            = EXCLUDED.height_cm,
         weight_kg            = EXCLUDED.weight_kg,
         goal_weight_kg       = EXCLUDED.goal_weight_kg,
         activity_level       = EXCLUDED.activity_level,
         nutritional_objective= EXCLUDED.nutritional_objective,
         age                  = COALESCE(EXCLUDED.age, health_profiles.age),
         biological_sex       = COALESCE(EXCLUDED.biological_sex, health_profiles.biological_sex),
         systolic_pressure    = COALESCE(EXCLUDED.systolic_pressure, health_profiles.systolic_pressure),
         diastolic_pressure   = COALESCE(EXCLUDED.diastolic_pressure, health_profiles.diastolic_pressure),
         glucose_mg_dl        = COALESCE(EXCLUDED.glucose_mg_dl, health_profiles.glucose_mg_dl),
         updated_at           = NOW()
       RETURNING *`,
      [req.user.id, heightCm, weightKg, goalWeightKg ?? null, activityLevel, nutritionalObjective ?? null,
       age ?? null, biologicalSex ?? null, systolicPressure ?? null, diastolicPressure ?? null, glucoseMgDl ?? null],
    )
    const profile = rows[0]
    // Auto-assign patient to first available nutritionist if no plan exists yet
    const role = req.user.role
    if (role === 'PACIENTE' || role === 'PATIENT') {
      autoAssignNutritionist(req.user.id, profile).catch(() => {})
    }
    res.json(formatProfile(profile))
  } catch (err) {
    next(err)
  }
})

async function autoAssignNutritionist(patientId, profile) {
  const existing = await pool.query(
    'SELECT id FROM plan_assignments WHERE patient_id = $1 LIMIT 1', [patientId]
  )
  if (existing.rows.length) return

  const { rows: nutritionists } = await pool.query(
    "SELECT id FROM users WHERE role IN ('NUTRICIONISTA','NUTRITIONIST') LIMIT 1"
  )
  if (!nutritionists.length) return
  const nutritionistId = nutritionists[0].id

  const base = 2000
  const actMult = { LOW: 1.0, MODERATE: 1.3, HIGH: 1.6 }
  const objAdj = { LOSE_WEIGHT: -300, MAINTAIN_WEIGHT: 0, GAIN_MUSCLE: 300 }
  const cal = Math.round(base * (actMult[profile.activity_level] ?? 1) + (objAdj[profile.nutritional_objective] ?? 0))
  const protein = Math.round((cal * 0.30) / 4)
  const carbs = Math.round((cal * 0.45) / 4)
  const fat = Math.round((cal * 0.25) / 9)

  const { rows: plans } = await pool.query(
    `INSERT INTO nutritional_plans (name, calorie_target, protein_grams, carbs_grams, fat_grams, status, nutritionist_id, patient_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,'ACTIVATED',$6,$7,NOW(),NOW()) RETURNING id`,
    [`Plan personalizado`, cal, protein, carbs, fat, nutritionistId, patientId]
  )
  await pool.query(
    'INSERT INTO plan_assignments (plan_id, patient_id, nutritionist_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    [plans[0].id, patientId, nutritionistId]
  )
}

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
      bmi: calcBMI(profile.weight_kg, profile.height_cm),
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

// PUT /api/v1/profile/nutritional-goal
router.put('/nutritional-goal', async (req, res, next) => {
  try {
    const { nutritionalObjective } = req.body
    if (!nutritionalObjective) return res.status(400).json({ message: 'nutritionalObjective is required.' })

    const existing = await pool.query('SELECT * FROM health_profiles WHERE user_id = $1', [req.user.id])
    let rows
    if (existing.rows.length) {
      ;({ rows } = await pool.query(
        'UPDATE health_profiles SET nutritional_objective = $2, updated_at = NOW() WHERE user_id = $1 RETURNING *',
        [req.user.id, nutritionalObjective],
      ))
    } else {
      ;({ rows } = await pool.query(
        `INSERT INTO health_profiles (user_id, nutritional_objective, height_cm, weight_kg, created_at, updated_at)
         VALUES ($1, $2, 0, 0, NOW(), NOW()) RETURNING *`,
        [req.user.id, nutritionalObjective],
      ))
    }
    res.json(formatProfile(rows[0]))
  } catch (err) {
    next(err)
  }
})

// PUT /api/v1/profile/restrictions
router.put('/restrictions', async (req, res, next) => {
  try {
    const { restrictions } = req.body
    const value = Array.isArray(restrictions) ? restrictions.join(',') : (restrictions ?? '')

    const existing = await pool.query('SELECT * FROM health_profiles WHERE user_id = $1', [req.user.id])
    let rows
    if (existing.rows.length) {
      ;({ rows } = await pool.query(
        'UPDATE health_profiles SET dietary_restrictions = $2, updated_at = NOW() WHERE user_id = $1 RETURNING *',
        [req.user.id, value],
      ))
    } else {
      ;({ rows } = await pool.query(
        `INSERT INTO health_profiles (user_id, dietary_restrictions, height_cm, weight_kg, created_at, updated_at)
         VALUES ($1, $2, 0, 0, NOW(), NOW()) RETURNING *`,
        [req.user.id, value],
      ))
    }
    res.json(formatProfile(rows[0]))
  } catch (err) {
    next(err)
  }
})

module.exports = router

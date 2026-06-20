const router = require('express').Router()
const pool = require('../config/db')
const authenticate = require('../middleware/auth')

router.use(authenticate)

function formatPlan(row) {
  return {
    id: row.id,
    name: row.name,
    calorieTarget: row.calorie_target,
    proteinGrams: row.protein_grams,
    carbsGrams: row.carbs_grams,
    fatGrams: row.fat_grams,
    status: row.status,
    nutritionistId: row.nutritionist_id,
    patientId: row.patient_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function calcBMI(w, h) {
  if (!w || !h) return null
  return Math.round((w / ((h / 100) ** 2)) * 10) / 10
}

function getBmiStatus(bmi) {
  if (!bmi) return '-'
  if (bmi < 18.5) return 'Bajo peso'
  if (bmi < 25) return 'Normal'
  if (bmi < 30) return 'Sobrepeso'
  return 'Obesidad'
}

function calcMacros(cal, proteinG, carbsG, fatG) {
  if (!cal || !proteinG) return null
  const total = proteinG * 4 + carbsG * 4 + fatG * 9
  if (!total) return null
  return {
    proteins: Math.round((proteinG * 4 / total) * 100),
    carbohydrates: Math.round((carbsG * 4 / total) * 100),
    fats: Math.round((fatG * 9 / total) * 100),
  }
}

const GOAL_LABELS = {
  LOSE_WEIGHT: 'Perder peso',
  MAINTAIN_WEIGHT: 'Mantener peso',
  GAIN_MUSCLE: 'Ganar músculo',
}

// GET /api/v1/nutritional-plans/my-patients
router.get('/my-patients', async (req, res, next) => {
  try {
    const role = req.user.role
    if (role !== 'NUTRICIONISTA' && role !== 'NUTRITIONIST') {
      return res.status(403).json({ message: 'Only nutritionists can access this endpoint.' })
    }

    const { rows } = await pool.query(
      `SELECT np.*, pa.patient_id,
              u.first_name, u.last_name, u.email,
              hp.height_cm, hp.weight_kg, hp.goal_weight_kg, hp.age,
              hp.nutritional_objective, hp.activity_level, hp.updated_at AS profile_updated
       FROM plan_assignments pa
       JOIN nutritional_plans np ON np.id = pa.plan_id
       JOIN users u ON u.id = pa.patient_id
       LEFT JOIN health_profiles hp ON hp.user_id = pa.patient_id
       WHERE pa.nutritionist_id = $1
       ORDER BY pa.assigned_at DESC`,
      [req.user.id],
    )

    // Deduplicate by patient_id — keep latest plan per patient
    const byPatient = new Map()
    for (const row of rows) {
      if (!byPatient.has(row.patient_id)) byPatient.set(row.patient_id, row)
    }

    const patients = await Promise.all(
      Array.from(byPatient.values()).map(async (row) => {
        const today = new Date().toISOString().slice(0, 10)
        const { rows: food } = await pool.query(
          `SELECT COALESCE(SUM(calories),0) AS consumed
           FROM food_entries WHERE user_id=$1 AND DATE(logged_at)=$2`,
          [row.patient_id, today],
        )
        const consumed = Number(food[0]?.consumed ?? 0)
        const target = Number(row.calorie_target ?? 2000)
        const adherencePct = target > 0 ? Math.min(Math.round((consumed / target) * 100), 100) : 0
        const isComplete = !!(row.height_cm && row.weight_kg && row.nutritional_objective && row.activity_level)

        return {
          id: row.patient_id,
          name: `${row.first_name} ${row.last_name}`,
          email: row.email,
          age: row.age ?? null,
          currentWeight: row.weight_kg ? parseFloat(row.weight_kg) : null,
          weightKg: row.weight_kg ? parseFloat(row.weight_kg) : null,
          goalWeightKg: row.goal_weight_kg ? parseFloat(row.goal_weight_kg) : null,
          bmi: calcBMI(row.weight_kg, row.height_cm),
          nutritionalGoalLabel: GOAL_LABELS[row.nutritional_objective] ?? row.nutritional_objective ?? '-',
          isComplete,
          planStatus: row.status,
          adherence: { percentage: adherencePct, consumed, target, label: adherencePct >= 80 ? 'Buena' : adherencePct >= 50 ? 'Regular' : 'Baja' },
          updatedAt: row.profile_updated ? new Date(row.profile_updated).toLocaleDateString('es-PE') : '-',
          plan: formatPlan(row),
          evaluations: [],
          followUpNotes: [],
        }
      }),
    )

    res.json({ nutritionist: { id: req.user.id }, patients })
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/nutritional-plans/patients/:patientId
router.get('/patients/:patientId', async (req, res, next) => {
  try {
    const { patientId } = req.params
    const { rows } = await pool.query(
      `SELECT np.*, pa.patient_id,
              u.first_name, u.last_name, u.email,
              hp.height_cm, hp.weight_kg, hp.goal_weight_kg, hp.age,
              hp.nutritional_objective, hp.activity_level, hp.updated_at AS profile_updated
       FROM plan_assignments pa
       JOIN nutritional_plans np ON np.id = pa.plan_id
       JOIN users u ON u.id = pa.patient_id
       LEFT JOIN health_profiles hp ON hp.user_id = pa.patient_id
       WHERE pa.nutritionist_id=$1 AND pa.patient_id=$2
       ORDER BY pa.assigned_at DESC`,
      [req.user.id, patientId],
    )
    if (!rows.length) return res.status(404).json({ message: 'Patient not found for this nutritionist.' })

    const row = rows[0]
    const isComplete = !!(row.height_cm && row.weight_kg && row.nutritional_objective && row.activity_level)

    const [{ rows: foodLogs }, { rows: weightRows }] = await Promise.all([
      pool.query('SELECT * FROM food_entries WHERE user_id=$1 ORDER BY logged_at DESC LIMIT 20', [patientId]),
      pool.query('SELECT * FROM weight_records WHERE user_id=$1 ORDER BY recorded_at DESC LIMIT 10', [patientId]),
    ])

    const today = new Date().toISOString().slice(0, 10)
    const consumed = foodLogs
      .filter(f => f.logged_at && new Date(f.logged_at).toISOString().slice(0, 10) === today)
      .reduce((s, f) => s + Number(f.calories ?? 0), 0)
    const target = Number(row.calorie_target ?? 2000)
    const adherencePct = target > 0 ? Math.min(Math.round((consumed / target) * 100), 100) : 0

    // Weight history sorted ascending
    const sortedWeights = [...weightRows].sort(
      (a, b) => new Date(a.recorded_at) - new Date(b.recorded_at)
    )
    const initialWeightVal = sortedWeights.length
      ? parseFloat(sortedWeights[0].weight_kg)
      : (row.weight_kg ? parseFloat(row.weight_kg) : null)
    const currentWeightVal = sortedWeights.length
      ? parseFloat(sortedWeights[sortedWeights.length - 1].weight_kg)
      : (row.weight_kg ? parseFloat(row.weight_kg) : null)
    const goalWeightVal = row.goal_weight_kg ? parseFloat(row.goal_weight_kg) : null
    const bmiVal = calcBMI(currentWeightVal, row.height_cm)

    const weightChange = (initialWeightVal != null && currentWeightVal != null)
      ? Math.round((currentWeightVal - initialWeightVal) * 10) / 10
      : null
    const remainingToGoal = (currentWeightVal != null && goalWeightVal != null)
      ? Math.round((goalWeightVal - currentWeightVal) * 10) / 10
      : null

    const adherenceLabel = adherencePct >= 80 ? 'Buena' : adherencePct >= 50 ? 'Regular' : 'Baja'

    res.json({
      nutritionist: { id: req.user.id },
      patient: {
        id: row.patient_id,
        name: `${row.first_name} ${row.last_name}`,
        email: row.email,
        age: row.age ?? null,
        heightCm: row.height_cm ?? null,
        currentWeight: currentWeightVal,
        initialWeight: initialWeightVal,
        weightChange,
        remainingToGoal,
        bmi: bmiVal,
        bmiStatus: getBmiStatus(bmiVal),
        goalWeightKg: goalWeightVal,
        targetWeightKg: goalWeightVal,
        nutritionalGoalLabel: GOAL_LABELS[row.nutritional_objective] ?? '-',
        isComplete,
        planStatus: row.status,
        dailyCalories: Number(row.calorie_target ?? 0),
        macros: calcMacros(row.calorie_target, row.protein_grams, row.carbs_grams, row.fat_grams),
        adherence: { percentage: adherencePct, consumed, target, label: adherenceLabel },
        dietaryRestrictions: [],
        systolicPressure: null,
        diastolicPressure: null,
        basalGlucose: null,
        updatedAt: row.profile_updated ? new Date(row.profile_updated).toLocaleDateString('es-PE') : '-',
        plan: formatPlan(row),
        allPlans: rows.map(formatPlan),
        foodLogs: foodLogs.map(f => ({
          id: f.id, mealType: f.meal_type, description: f.food_name,
          calories: Number(f.calories),
          date: f.logged_at ? new Date(f.logged_at).toISOString().slice(0, 10) : null,
        })),
        weightRecords: sortedWeights.map(w => ({
          id: w.id, weightKg: parseFloat(w.weight_kg),
          date: w.recorded_at ? new Date(w.recorded_at).toISOString().slice(0, 10) : null,
        })),
        evaluations: [],
        followUpNotes: [],
        lastEvaluation: null,
        lastNote: null,
      },
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/nutritional-plans/patients/:patientId/notes
router.post('/patients/:patientId/notes', async (req, res, next) => {
  try {
    const { note } = req.body
    if (!note?.trim()) return res.status(400).json({ message: 'note is required.' })
    res.status(201).json({
      id: Date.now(), nutritionistId: req.user.id,
      patientId: Number(req.params.patientId), note,
      createdAt: new Date().toISOString(),
    })
  } catch (err) { next(err) }
})

// POST /api/v1/nutritional-plans/patients/:patientId/evaluations
router.post('/patients/:patientId/evaluations', async (req, res, next) => {
  try {
    const { observations, targetCalories, proteinPercentage, carbohydratePercentage, fatPercentage } = req.body
    if (!observations?.trim()) return res.status(400).json({ message: 'observations is required.' })
    res.status(201).json({
      id: Date.now(), nutritionistId: req.user.id,
      patientId: Number(req.params.patientId),
      observations, targetCalories,
      macros: { proteinPercentage, carbohydratePercentage, fatPercentage },
      createdAt: new Date().toISOString(),
    })
  } catch (err) { next(err) }
})

// GET /api/v1/nutritional-plans
router.get('/', async (req, res, next) => {
  try {
    const role = req.user.role
    const isPatient = role === 'PATIENT' || role === 'PACIENTE'
    let rows
    if (isPatient) {
      // Patient sees plans assigned to them via plan_assignments OR all activated plans (fallback)
      const res1 = await pool.query(
        `SELECT np.* FROM nutritional_plans np
         JOIN plan_assignments pa ON pa.plan_id = np.id
         WHERE pa.patient_id=$1 AND np.status='ACTIVATED'
         ORDER BY np.created_at DESC`,
        [req.user.id],
      )
      if (res1.rows.length) {
        rows = res1.rows
      } else {
        // Fallback: all activated plans (legacy)
        const res2 = await pool.query(
          "SELECT * FROM nutritional_plans WHERE status='ACTIVATED' ORDER BY created_at DESC",
        )
        rows = res2.rows
      }
    } else {
      const res1 = await pool.query(
        'SELECT * FROM nutritional_plans WHERE nutritionist_id=$1 ORDER BY created_at DESC',
        [req.user.id],
      )
      rows = res1.rows
    }
    res.json(rows.map(formatPlan))
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/nutritional-plans
router.post('/', async (req, res, next) => {
  try {
    const { name, calorieTarget, proteinGrams, carbsGrams, fatGrams, patientId } = req.body
    if (!name || !calorieTarget) {
      return res.status(400).json({ message: 'Name and calorieTarget are required.' })
    }
    const { rows } = await pool.query(
      `INSERT INTO nutritional_plans (name, calorie_target, protein_grams, carbs_grams, fat_grams, status, nutritionist_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVATED', $6, NOW(), NOW()) RETURNING *`,
      [name, calorieTarget, proteinGrams, carbsGrams, fatGrams, req.user.id],
    )
    const plan = rows[0]
    // If patientId provided, link via plan_assignments
    if (patientId) {
      await pool.query(
        `INSERT INTO plan_assignments (plan_id, patient_id, nutritionist_id)
         VALUES ($1, $2, $3) ON CONFLICT (plan_id, patient_id) DO NOTHING`,
        [plan.id, patientId, req.user.id],
      )
    }
    res.status(201).json(formatPlan(plan))
  } catch (err) {
    next(err)
  }
})

// PATCH /api/v1/nutritional-plans/:planId/status
router.patch('/:planId/status', async (req, res, next) => {
  try {
    const { status } = req.body
    if (!status) return res.status(400).json({ message: 'status is required.' })
    const { rows } = await pool.query(
      'UPDATE nutritional_plans SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [status, req.params.planId],
    )
    if (!rows.length) return res.status(404).json({ message: 'Plan not found.' })
    res.json(formatPlan(rows[0]))
  } catch (err) { next(err) }
})

// GET /api/v1/nutritional-plans/:planId/weekly-diet
router.get('/:planId/weekly-diet', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM nutritional_plans WHERE id=$1', [req.params.planId])
    if (!rows.length) return res.status(404).json({ message: `Plan ${req.params.planId} not found.` })
    const plan = rows[0]
    const cal = plan.calorie_target
    const days = [
      { day: 'Lunes', meals: [{ type: 'Desayuno', description: 'Avena con frutas', calories: Math.round(cal * 0.25) }, { type: 'Almuerzo', description: 'Pollo a la plancha con ensalada', calories: Math.round(cal * 0.35) }, { type: 'Cena', description: 'Salmón con vegetales', calories: Math.round(cal * 0.30) }, { type: 'Snack', description: 'Yogur griego', calories: Math.round(cal * 0.10) }] },
      { day: 'Martes', meals: [{ type: 'Desayuno', description: 'Huevos y tostada integral', calories: Math.round(cal * 0.25) }, { type: 'Almuerzo', description: 'Wrap de pavo y aguacate', calories: Math.round(cal * 0.35) }, { type: 'Cena', description: 'Pasta con salsa de tomate', calories: Math.round(cal * 0.30) }, { type: 'Snack', description: 'Frutos secos', calories: Math.round(cal * 0.10) }] },
      { day: 'Miércoles', meals: [{ type: 'Desayuno', description: 'Parfait de yogur', calories: Math.round(cal * 0.25) }, { type: 'Almuerzo', description: 'Ensalada de atún', calories: Math.round(cal * 0.35) }, { type: 'Cena', description: 'Bistec con quinoa', calories: Math.round(cal * 0.30) }, { type: 'Snack', description: 'Manzana con mantequilla de maní', calories: Math.round(cal * 0.10) }] },
      { day: 'Jueves', meals: [{ type: 'Desayuno', description: 'Batido de proteínas', calories: Math.round(cal * 0.25) }, { type: 'Almuerzo', description: 'Ensalada César con pollo', calories: Math.round(cal * 0.35) }, { type: 'Cena', description: 'Pescado horneado con camote', calories: Math.round(cal * 0.30) }, { type: 'Snack', description: 'Queso cottage', calories: Math.round(cal * 0.10) }] },
      { day: 'Viernes', meals: [{ type: 'Desayuno', description: 'Pancakes integrales', calories: Math.round(cal * 0.25) }, { type: 'Almuerzo', description: 'Hamburguesa vegetal', calories: Math.round(cal * 0.35) }, { type: 'Cena', description: 'Pollo BBQ con choclo', calories: Math.round(cal * 0.30) }, { type: 'Snack', description: 'Galletas de arroz', calories: Math.round(cal * 0.10) }] },
      { day: 'Sábado', meals: [{ type: 'Desayuno', description: 'Tostadas francesas', calories: Math.round(cal * 0.25) }, { type: 'Almuerzo', description: 'Bowl de sushi', calories: Math.round(cal * 0.35) }, { type: 'Cena', description: 'Salteado de res con arroz integral', calories: Math.round(cal * 0.30) }, { type: 'Snack', description: 'Ensalada de frutas', calories: Math.round(cal * 0.10) }] },
      { day: 'Domingo', meals: [{ type: 'Desayuno', description: 'Tostada de aguacate con huevos', calories: Math.round(cal * 0.25) }, { type: 'Almuerzo', description: 'Pollo rostizado con vegetales', calories: Math.round(cal * 0.35) }, { type: 'Cena', description: 'Sopa de lentejas', calories: Math.round(cal * 0.30) }, { type: 'Snack', description: 'Barra de proteínas', calories: Math.round(cal * 0.10) }] },
    ]
    res.json({ planId: plan.id, planName: plan.name, calorieTarget: cal, days })
  } catch (err) { next(err) }
})

module.exports = router

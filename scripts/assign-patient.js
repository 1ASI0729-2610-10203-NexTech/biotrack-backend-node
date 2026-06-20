/**
 * Finds a patient by email and assigns them to the first available nutritionist.
 * Usage: $env:DATABASE_URL="..." ; $env:PATIENT_EMAIL="..." ; node scripts/assign-patient.js
 */
require('dotenv').config()
const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

async function run() {
  const email = process.env.PATIENT_EMAIL
  if (!email) { console.error('Set PATIENT_EMAIL env var'); process.exit(1) }

  const { rows: patients } = await pool.query('SELECT * FROM users WHERE email = $1', [email])
  if (!patients.length) { console.error('Patient not found:', email); process.exit(1) }
  const patient = patients[0]
  console.log('Patient:', patient.first_name, patient.last_name, `(id=${patient.id})`)

  // Ensure profile has dietary_restrictions set
  await pool.query(
    "UPDATE health_profiles SET dietary_restrictions = '' WHERE user_id = $1 AND dietary_restrictions IS NULL",
    [patient.id]
  )

  // Get first nutritionist
  const { rows: nutritionists } = await pool.query(
    "SELECT * FROM users WHERE role IN ('NUTRICIONISTA','NUTRITIONIST') LIMIT 1"
  )
  if (!nutritionists.length) { console.error('No nutritionist found'); process.exit(1) }
  const nutritionist = nutritionists[0]
  console.log('Nutritionist:', nutritionist.first_name, nutritionist.last_name, `(id=${nutritionist.id})`)

  // Check if patient already has a plan
  const { rows: existing } = await pool.query(
    'SELECT pa.* FROM plan_assignments pa WHERE pa.patient_id = $1 AND pa.nutritionist_id = $2',
    [patient.id, nutritionist.id]
  )
  if (existing.length) {
    console.log('Patient already has a plan assignment. Done.')
    return
  }

  // Get patient's health profile to set calorie target
  const { rows: profiles } = await pool.query('SELECT * FROM health_profiles WHERE user_id = $1', [patient.id])
  const profile = profiles[0]
  const calorieTarget = profile ? calcCalories(profile.activity_level, profile.nutritional_objective) : 1800
  const protein = Math.round((calorieTarget * 0.30) / 4)
  const carbs = Math.round((calorieTarget * 0.45) / 4)
  const fat = Math.round((calorieTarget * 0.25) / 9)

  // Create plan
  const { rows: plans } = await pool.query(
    `INSERT INTO nutritional_plans (name, calorie_target, protein_grams, carbs_grams, fat_grams, status, nutritionist_id, patient_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'ACTIVATED', $6, $7, NOW(), NOW()) RETURNING id`,
    [`Plan para ${patient.first_name}`, calorieTarget, protein, carbs, fat, nutritionist.id, patient.id]
  )
  const planId = plans[0].id

  // Create assignment
  await pool.query(
    'INSERT INTO plan_assignments (plan_id, patient_id, nutritionist_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [planId, patient.id, nutritionist.id]
  )

  console.log(`Plan created (id=${planId}, ${calorieTarget} kcal) and assigned. Done.`)
}

function calcCalories(activityLevel, nutritionalObjective) {
  const base = 2000
  const actMult = { LOW: 1.0, MODERATE: 1.3, HIGH: 1.6 }
  const objAdj = { LOSE_WEIGHT: -300, MAINTAIN_WEIGHT: 0, GAIN_MUSCLE: 300 }
  return Math.round(base * (actMult[activityLevel] ?? 1) + (objAdj[nutritionalObjective] ?? 0))
}

run().catch(e => { console.error(e.message); process.exit(1) }).finally(() => pool.end())

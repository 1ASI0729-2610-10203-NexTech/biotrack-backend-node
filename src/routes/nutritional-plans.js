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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// GET /api/v1/nutritional-plans
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM nutritional_plans WHERE nutritionist_id = $1 ORDER BY created_at DESC',
      [req.user.id],
    )
    res.json(rows.map(formatPlan))
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/nutritional-plans
router.post('/', async (req, res, next) => {
  try {
    const { name, calorieTarget, proteinGrams, carbsGrams, fatGrams } = req.body
    if (!name || !calorieTarget) {
      return res.status(400).json({ message: 'Name and calorieTarget are required.' })
    }

    const { rows } = await pool.query(
      `INSERT INTO nutritional_plans (name, calorie_target, protein_grams, carbs_grams, fat_grams, status, nutritionist_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, NOW(), NOW()) RETURNING *`,
      [name, calorieTarget, proteinGrams, carbsGrams, fatGrams, req.user.id],
    )
    res.status(201).json(formatPlan(rows[0]))
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/nutritional-plans/:planId/weekly-diet
router.get('/:planId/weekly-diet', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM nutritional_plans WHERE id = $1', [req.params.planId])
    if (!rows.length) {
      return res.status(404).json({ message: `Plan with ID ${req.params.planId} not found.` })
    }

    const plan = rows[0]
    const cal = plan.calorie_target
    const days = [
      {
        day: 'Monday',
        meals: [
          { type: 'Breakfast', description: 'Oatmeal with fruits', calories: Math.round(cal * 0.25) },
          { type: 'Lunch', description: 'Grilled chicken with salad', calories: Math.round(cal * 0.35) },
          { type: 'Dinner', description: 'Salmon with vegetables', calories: Math.round(cal * 0.30) },
          { type: 'Snack', description: 'Greek yogurt', calories: Math.round(cal * 0.10) },
        ],
      },
      {
        day: 'Tuesday',
        meals: [
          { type: 'Breakfast', description: 'Eggs and whole grain toast', calories: Math.round(cal * 0.25) },
          { type: 'Lunch', description: 'Turkey and avocado wrap', calories: Math.round(cal * 0.35) },
          { type: 'Dinner', description: 'Pasta with tomato sauce', calories: Math.round(cal * 0.30) },
          { type: 'Snack', description: 'Mixed nuts', calories: Math.round(cal * 0.10) },
        ],
      },
      {
        day: 'Wednesday',
        meals: [
          { type: 'Breakfast', description: 'Yogurt parfait', calories: Math.round(cal * 0.25) },
          { type: 'Lunch', description: 'Tuna salad', calories: Math.round(cal * 0.35) },
          { type: 'Dinner', description: 'Grilled steak with quinoa', calories: Math.round(cal * 0.30) },
          { type: 'Snack', description: 'Apple with peanut butter', calories: Math.round(cal * 0.10) },
        ],
      },
      {
        day: 'Thursday',
        meals: [
          { type: 'Breakfast', description: 'Protein smoothie', calories: Math.round(cal * 0.25) },
          { type: 'Lunch', description: 'Chicken caesar salad', calories: Math.round(cal * 0.35) },
          { type: 'Dinner', description: 'Baked fish with sweet potato', calories: Math.round(cal * 0.30) },
          { type: 'Snack', description: 'Cottage cheese', calories: Math.round(cal * 0.10) },
        ],
      },
      {
        day: 'Friday',
        meals: [
          { type: 'Breakfast', description: 'Whole grain pancakes', calories: Math.round(cal * 0.25) },
          { type: 'Lunch', description: 'Veggie burger', calories: Math.round(cal * 0.35) },
          { type: 'Dinner', description: 'BBQ chicken with corn', calories: Math.round(cal * 0.30) },
          { type: 'Snack', description: 'Rice cakes', calories: Math.round(cal * 0.10) },
        ],
      },
      {
        day: 'Saturday',
        meals: [
          { type: 'Breakfast', description: 'French toast', calories: Math.round(cal * 0.25) },
          { type: 'Lunch', description: 'Sushi bowl', calories: Math.round(cal * 0.35) },
          { type: 'Dinner', description: 'Beef stir-fry with brown rice', calories: Math.round(cal * 0.30) },
          { type: 'Snack', description: 'Fruit salad', calories: Math.round(cal * 0.10) },
        ],
      },
      {
        day: 'Sunday',
        meals: [
          { type: 'Breakfast', description: 'Avocado toast with eggs', calories: Math.round(cal * 0.25) },
          { type: 'Lunch', description: 'Roast chicken with vegetables', calories: Math.round(cal * 0.35) },
          { type: 'Dinner', description: 'Lentil soup', calories: Math.round(cal * 0.30) },
          { type: 'Snack', description: 'Protein bar', calories: Math.round(cal * 0.10) },
        ],
      },
    ]

    res.json({
      planId: plan.id,
      planName: plan.name,
      calorieTarget: cal,
      days,
    })
  } catch (err) {
    next(err)
  }
})

module.exports = router

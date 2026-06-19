const router = require('express').Router()
const pool = require('../config/db')
const authenticate = require('../middleware/auth')

router.use(authenticate)

// GET /api/v1/progress/charts
router.get('/charts', async (req, res, next) => {
  try {
    const [weightsRes, activitiesRes, foodRes] = await Promise.all([
      pool.query(
        'SELECT weight_kg, recorded_at FROM weight_records WHERE user_id = $1 ORDER BY recorded_at ASC LIMIT 30',
        [req.user.id],
      ),
      pool.query(
        'SELECT calories_burned, logged_at FROM activity_entries WHERE user_id = $1 ORDER BY logged_at ASC LIMIT 30',
        [req.user.id],
      ),
      pool.query(
        'SELECT SUM(calories) as total, DATE(logged_at) as day FROM food_entries WHERE user_id = $1 GROUP BY DATE(logged_at) ORDER BY day ASC LIMIT 30',
        [req.user.id],
      ),
    ])

    res.json({
      charts: [
        {
          name: 'Weight Progress',
          data: weightsRes.rows.map((r) => ({ value: parseFloat(r.weight_kg), date: r.recorded_at })),
        },
        {
          name: 'Activity Calories Burned',
          data: activitiesRes.rows.map((r) => ({ value: r.calories_burned, date: r.logged_at })),
        },
        {
          name: 'Daily Calorie Intake',
          data: foodRes.rows.map((r) => ({ value: parseFloat(r.total), date: r.day })),
        },
      ],
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/progress/food-log
router.post('/food-log', async (req, res, next) => {
  try {
    const { mealType, foodName, calories } = req.body
    if (!mealType || !foodName || calories == null) {
      return res.status(400).json({ message: 'mealType, foodName and calories are required.' })
    }

    const { rows } = await pool.query(
      'INSERT INTO food_entries (user_id, meal_type, food_name, calories, logged_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
      [req.user.id, mealType, foodName, calories],
    )
    const r = rows[0]
    res.status(201).json({
      id: r.id,
      mealType: r.meal_type,
      foodName: r.food_name,
      calories: r.calories,
      loggedAt: r.logged_at,
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/progress/activity-log
router.post('/activity-log', async (req, res, next) => {
  try {
    const { activityType, durationMinutes } = req.body
    if (!activityType || !durationMinutes) {
      return res.status(400).json({ message: 'activityType and durationMinutes are required.' })
    }

    const caloriesBurned = Math.round(durationMinutes * 7)
    const { rows } = await pool.query(
      'INSERT INTO activity_entries (user_id, activity_type, duration_minutes, calories_burned, logged_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
      [req.user.id, activityType, durationMinutes, caloriesBurned],
    )
    const r = rows[0]
    res.status(201).json({
      id: r.id,
      activityType: r.activity_type,
      durationMinutes: r.duration_minutes,
      caloriesBurned: r.calories_burned,
      loggedAt: r.logged_at,
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/progress/weight-update
router.post('/weight-update', async (req, res, next) => {
  try {
    const { weightKg, notes } = req.body
    if (weightKg == null) return res.status(400).json({ message: 'weightKg is required.' })

    const { rows } = await pool.query(
      'INSERT INTO weight_records (user_id, weight_kg, notes, recorded_at) VALUES ($1, $2, $3, NOW()) RETURNING *',
      [req.user.id, weightKg, notes ?? ''],
    )
    const r = rows[0]
    res.status(201).json({
      id: r.id,
      weightKg: r.weight_kg,
      notes: r.notes,
      recordedAt: r.recorded_at,
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/progress/activity-history
router.get('/activity-history', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM activity_entries WHERE user_id = $1 ORDER BY logged_at DESC',
      [req.user.id],
    )
    res.json(
      rows.map((r) => ({
        id: r.id,
        activityType: r.activity_type,
        durationMinutes: r.duration_minutes,
        caloriesBurned: r.calories_burned,
        loggedAt: r.logged_at,
      })),
    )
  } catch (err) {
    next(err)
  }
})

module.exports = router

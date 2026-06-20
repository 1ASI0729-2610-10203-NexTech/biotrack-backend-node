const router = require('express').Router()
const pool = require('../config/db')
const authenticate = require('../middleware/auth')

router.use(authenticate)

// Mapeo de status integer ↔ string
// subscription status: 1=ACTIVE, 2=SUSPENDED, 3=CANCELLED
// payment status:      1=PAID,   2=PENDING,   3=FAILED

function planDescription(name) {
  if (name === 'Basico') return 'Acceso básico gratuito para explorar la plataforma.'
  if (name === 'Profesional') return 'Acceso completo con seguimiento nutricional personalizado.'
  if (name === 'Premium') return 'Todo Profesional más análisis avanzados y soporte prioritario.'
  return ''
}

// GET /api/v1/subscriptions/plans
router.get('/plans', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM subscription_plans WHERE is_active = true ORDER BY monthly_amount ASC',
    )
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        price: parseFloat(r.monthly_amount),
        billingCycle: 'MONTHLY',
        description: planDescription(r.name),
      })),
    )
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/subscriptions/active
router.get('/active', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, sp.name AS plan_name
       FROM subscriptions s
       JOIN subscription_plans sp ON sp.id = s.plan_id
       WHERE s.user_id = $1 AND s.status = 1
       ORDER BY s.start_date DESC LIMIT 1`,
      [req.user.id],
    )
    if (!rows.length) return res.json(null)
    const sub = rows[0]
    const paymentsRes = await pool.query(
      'SELECT * FROM payments WHERE subscription_id = $1 ORDER BY payment_date DESC',
      [sub.id],
    )
    res.json({
      id: sub.id,
      planId: sub.plan_id,
      planName: sub.plan_name,
      status: 'ACTIVE',
      startDate: sub.start_date,
      nextBillingDate: sub.next_billing_date,
      payments: paymentsRes.rows,
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/subscriptions/activate
router.post('/activate', async (req, res, next) => {
  try {
    const { planId, startDate } = req.body
    if (!planId || !startDate) {
      return res.status(400).json({ message: 'planId and startDate are required.' })
    }

    const planRes = await pool.query('SELECT * FROM subscription_plans WHERE id = $1', [planId])
    if (!planRes.rows.length) return res.status(404).json({ message: 'Subscription plan not found.' })

    const plan = planRes.rows[0]
    const nextBillingDate = new Date(startDate)
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1)
    const nextBillingStr = nextBillingDate.toISOString().slice(0, 10)
    const amount = parseFloat(plan.monthly_amount ?? 0)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const subResult = await client.query(
        `INSERT INTO subscriptions (user_id, plan_id, status, start_date, next_billing_date, created_at, updated_at)
         VALUES ($1, $2, 1, $3, $4, NOW(), NOW()) RETURNING *`,
        [req.user.id, planId, startDate, nextBillingStr],
      )
      const sub = subResult.rows[0]

      const txId = `TXN-${Date.now()}`
      await client.query(
        `INSERT INTO payments (subscription_id, payment_date, amount, status, transaction_id, gateway_message, created_at, updated_at)
         VALUES ($1, $2, $3, 1, $4, 'Pago procesado exitosamente', NOW(), NOW())`,
        [sub.id, startDate, amount, txId],
      )
      await client.query(
        `INSERT INTO invoices (subscription_id, issued_date, due_date, amount, is_paid, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
        [sub.id, startDate, nextBillingStr, amount],
      )

      await client.query('COMMIT')
      res.json({
        id: sub.id,
        userId: sub.user_id,
        planId: sub.plan_id,
        planName: plan.name,
        status: 'ACTIVE',
        startDate: sub.start_date,
        nextBillingDate: sub.next_billing_date,
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    next(err)
  }
})

// PATCH /api/v1/subscriptions/:subscriptionId/suspend
router.patch('/:subscriptionId/suspend', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'UPDATE subscriptions SET status = 2, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.subscriptionId, req.user.id],
    )
    if (!rows.length) return res.status(404).json({ message: 'Subscription not found.' })
    res.json({ id: rows[0].id, status: 'SUSPENDED' })
  } catch (err) {
    next(err)
  }
})

// PATCH /api/v1/subscriptions/:subscriptionId/reactivate
router.patch('/:subscriptionId/reactivate', async (req, res, next) => {
  try {
    const subRes = await pool.query(
      'SELECT s.*, sp.monthly_amount FROM subscriptions s JOIN subscription_plans sp ON sp.id = s.plan_id WHERE s.id = $1 AND s.user_id = $2',
      [req.params.subscriptionId, req.user.id],
    )
    if (!subRes.rows.length) return res.status(404).json({ message: 'Subscription not found.' })

    const sub = subRes.rows[0]
    const nextBillingDate = new Date()
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1)
    const nextBillingStr = nextBillingDate.toISOString().slice(0, 10)
    const amount = parseFloat(sub.monthly_amount ?? 0)
    const today = new Date().toISOString().slice(0, 10)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        'UPDATE subscriptions SET status = 1, next_billing_date = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [nextBillingStr, req.params.subscriptionId],
      )
      const txId = `TXN-${Date.now()}`
      await client.query(
        `INSERT INTO payments (subscription_id, payment_date, amount, status, transaction_id, gateway_message, created_at, updated_at)
         VALUES ($1, $2, $3, 1, $4, 'Reactivación procesada', NOW(), NOW())`,
        [req.params.subscriptionId, today, amount, txId],
      )
      await client.query(
        `INSERT INTO invoices (subscription_id, issued_date, due_date, amount, is_paid, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
        [req.params.subscriptionId, today, nextBillingStr, amount],
      )
      await client.query('COMMIT')
      res.json({ id: rows[0].id, status: 'ACTIVE', nextBillingDate: nextBillingStr })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/subscriptions/:subscriptionId/renewal
router.post('/:subscriptionId/renewal', async (req, res, next) => {
  try {
    const subRes = await pool.query(
      'SELECT s.*, sp.monthly_amount FROM subscriptions s JOIN subscription_plans sp ON sp.id = s.plan_id WHERE s.id = $1 AND s.user_id = $2',
      [req.params.subscriptionId, req.user.id],
    )
    if (!subRes.rows.length) return res.status(404).json({ message: 'Subscription not found.' })

    const sub = subRes.rows[0]
    const nextBillingDate = new Date(sub.next_billing_date)
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1)
    const nextBillingStr = nextBillingDate.toISOString().slice(0, 10)
    const amount = parseFloat(sub.monthly_amount ?? 0)
    const today = new Date().toISOString().slice(0, 10)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        'UPDATE subscriptions SET next_billing_date = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [nextBillingStr, req.params.subscriptionId],
      )
      const txId = `TXN-${Date.now()}`
      await client.query(
        `INSERT INTO payments (subscription_id, payment_date, amount, status, transaction_id, gateway_message, created_at, updated_at)
         VALUES ($1, $2, $3, 1, $4, 'Renovación procesada', NOW(), NOW())`,
        [req.params.subscriptionId, today, amount, txId],
      )
      await client.query(
        `INSERT INTO invoices (subscription_id, issued_date, due_date, amount, is_paid, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
        [req.params.subscriptionId, today, nextBillingStr, amount],
      )
      await client.query('COMMIT')
      res.json({ id: rows[0].id, status: 'ACTIVE', nextBillingDate: nextBillingStr })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/subscriptions/:subscriptionId/billing-summary
router.get('/:subscriptionId/billing-summary', async (req, res, next) => {
  try {
    const subRes = await pool.query(
      `SELECT s.*, sp.name AS plan_name, sp.monthly_amount
       FROM subscriptions s
       JOIN subscription_plans sp ON sp.id = s.plan_id
       WHERE s.id = $1 AND s.user_id = $2`,
      [req.params.subscriptionId, req.user.id],
    )
    if (!subRes.rows.length) return res.status(404).json({ message: 'Subscription not found.' })

    const s = subRes.rows[0]
    const [paymentsRes, pendingRes, outstandingRes] = await Promise.all([
      pool.query('SELECT * FROM payments WHERE subscription_id = $1 ORDER BY payment_date DESC', [req.params.subscriptionId]),
      pool.query('SELECT COUNT(*) FROM invoices WHERE subscription_id = $1 AND is_paid = false', [req.params.subscriptionId]),
      pool.query('SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE subscription_id = $1 AND is_paid = false', [req.params.subscriptionId]),
    ])

    res.json({
      subscriptionId: s.id,
      userId: s.user_id,
      status: s.status === 1 ? 'ACTIVE' : s.status === 2 ? 'SUSPENDED' : 'CANCELLED',
      planName: s.plan_name,
      billingCycle: 'MONTHLY',
      monthlyAmount: parseFloat(s.monthly_amount),
      startDate: s.start_date,
      nextBillingDate: s.next_billing_date,
      paymentHistory: paymentsRes.rows.map((p) => ({
        paymentId: p.id,
        date: p.payment_date,
        amount: parseFloat(p.amount),
        status: p.status === 1 ? 'PAID' : 'PENDING',
        transactionId: p.transaction_id,
      })),
      pendingInvoices: Number(pendingRes.rows[0].count),
      outstandingBalance: parseFloat(outstandingRes.rows[0].coalesce),
    })
  } catch (err) {
    next(err)
  }
})

module.exports = router

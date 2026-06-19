const router = require('express').Router()
const pool = require('../config/db')
const authenticate = require('../middleware/auth')

router.use(authenticate)

function formatSubscription(row) {
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    status: row.status,
    startDate: row.start_date,
    nextBillingDate: row.next_billing_date,
  }
}

function addOneMonth(dateInput) {
  const d = new Date(dateInput)
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

// POST /api/v1/subscriptions/activate
router.post('/activate', async (req, res, next) => {
  try {
    const { planId, startDate } = req.body
    if (!planId || !startDate) return res.status(400).json({ message: 'planId and startDate are required.' })

    const plan = await pool.query('SELECT * FROM subscription_plans WHERE id = $1', [planId])
    if (!plan.rows.length) return res.status(404).json({ message: 'Subscription plan not found.' })

    const nextBillingDate = addOneMonth(startDate)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const sub = await client.query(
        `INSERT INTO subscriptions (user_id, plan_id, status, start_date, next_billing_date)
         VALUES ($1, $2, 'ACTIVE', $3, $4) RETURNING *`,
        [req.user.id, planId, startDate, nextBillingDate],
      )
      const subId = sub.rows[0].id
      const txId = `TXN-${Date.now()}`
      const amount = plan.rows[0].price ?? 0

      await client.query(
        `INSERT INTO payments (subscription_id, amount, status, transaction_id, paid_at) VALUES ($1, $2, 'PAID', $3, NOW())`,
        [subId, amount, txId],
      )
      await client.query(
        `INSERT INTO invoices (subscription_id, status, amount, issued_at) VALUES ($1, 'PAID', $2, NOW())`,
        [subId, amount],
      )
      await client.query('COMMIT')
      res.json(formatSubscription(sub.rows[0]))
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
      "UPDATE subscriptions SET status = 'SUSPENDED' WHERE id = $1 AND user_id = $2 RETURNING *",
      [req.params.subscriptionId, req.user.id],
    )
    if (!rows.length) return res.status(404).json({ message: 'Subscription not found.' })
    res.json(formatSubscription(rows[0]))
  } catch (err) {
    next(err)
  }
})

// PATCH /api/v1/subscriptions/:subscriptionId/reactivate
router.patch('/:subscriptionId/reactivate', async (req, res, next) => {
  try {
    const subRes = await pool.query('SELECT * FROM subscriptions WHERE id = $1 AND user_id = $2', [
      req.params.subscriptionId,
      req.user.id,
    ])
    if (!subRes.rows.length) return res.status(404).json({ message: 'Subscription not found.' })

    const planRes = await pool.query('SELECT * FROM subscription_plans WHERE id = $1', [subRes.rows[0].plan_id])
    const nextBillingDate = addOneMonth(new Date().toISOString().slice(0, 10))
    const amount = planRes.rows[0]?.price ?? 0

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        "UPDATE subscriptions SET status = 'ACTIVE', next_billing_date = $1 WHERE id = $2 RETURNING *",
        [nextBillingDate, req.params.subscriptionId],
      )
      const txId = `TXN-${Date.now()}`
      await client.query(
        `INSERT INTO payments (subscription_id, amount, status, transaction_id, paid_at) VALUES ($1, $2, 'PAID', $3, NOW())`,
        [req.params.subscriptionId, amount, txId],
      )
      await client.query(
        `INSERT INTO invoices (subscription_id, status, amount, issued_at) VALUES ($1, 'PAID', $2, NOW())`,
        [req.params.subscriptionId, amount],
      )
      await client.query('COMMIT')
      res.json(formatSubscription(rows[0]))
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
    const subRes = await pool.query('SELECT * FROM subscriptions WHERE id = $1 AND user_id = $2', [
      req.params.subscriptionId,
      req.user.id,
    ])
    if (!subRes.rows.length) return res.status(404).json({ message: 'Subscription not found.' })

    const sub = subRes.rows[0]
    const planRes = await pool.query('SELECT * FROM subscription_plans WHERE id = $1', [sub.plan_id])
    const nextBillingDate = addOneMonth(sub.next_billing_date)
    const amount = planRes.rows[0]?.price ?? 0

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        'UPDATE subscriptions SET next_billing_date = $1 WHERE id = $2 RETURNING *',
        [nextBillingDate, req.params.subscriptionId],
      )
      const txId = `TXN-${Date.now()}`
      await client.query(
        `INSERT INTO payments (subscription_id, amount, status, transaction_id, paid_at) VALUES ($1, $2, 'PAID', $3, NOW())`,
        [req.params.subscriptionId, amount, txId],
      )
      await client.query(
        `INSERT INTO invoices (subscription_id, status, amount, issued_at) VALUES ($1, 'PAID', $2, NOW())`,
        [req.params.subscriptionId, amount],
      )
      await client.query('COMMIT')
      res.json(formatSubscription(rows[0]))
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
      `SELECT s.*, sp.name AS plan_name, sp.price AS monthly_amount, sp.billing_cycle
       FROM subscriptions s
       JOIN subscription_plans sp ON sp.id = s.plan_id
       WHERE s.id = $1 AND s.user_id = $2`,
      [req.params.subscriptionId, req.user.id],
    )
    if (!subRes.rows.length) return res.status(404).json({ message: 'Subscription not found.' })

    const s = subRes.rows[0]
    const [paymentsRes, pendingCountRes, outstandingRes] = await Promise.all([
      pool.query('SELECT * FROM payments WHERE subscription_id = $1 ORDER BY paid_at DESC', [req.params.subscriptionId]),
      pool.query("SELECT COUNT(*) FROM invoices WHERE subscription_id = $1 AND status = 'PENDING'", [
        req.params.subscriptionId,
      ]),
      pool.query("SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE subscription_id = $1 AND status = 'PENDING'", [
        req.params.subscriptionId,
      ]),
    ])

    res.json({
      subscriptionId: s.id,
      userId: s.user_id,
      status: s.status,
      planName: s.plan_name,
      billingCycle: s.billing_cycle ?? 'MONTHLY',
      monthlyAmount: parseFloat(s.monthly_amount),
      startDate: s.start_date,
      nextBillingDate: s.next_billing_date,
      paymentHistory: paymentsRes.rows.map((p) => ({
        paymentId: p.id,
        date: p.paid_at,
        amount: parseFloat(p.amount),
        status: p.status,
        transactionId: p.transaction_id,
      })),
      pendingInvoices: Number(pendingCountRes.rows[0].count),
      outstandingBalance: parseFloat(outstandingRes.rows[0].coalesce),
    })
  } catch (err) {
    next(err)
  }
})

module.exports = router

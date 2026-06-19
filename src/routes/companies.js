const router = require('express').Router()
const pool = require('../config/db')
const authenticate = require('../middleware/auth')

router.use(authenticate)

// POST /api/v1/companies
router.post('/', async (req, res, next) => {
  try {
    const { name, ruc, sector, country, city } = req.body
    if (!name || !ruc || !sector || !country || !city) {
      return res.status(400).json({ message: 'name, ruc, sector, country and city are required.' })
    }

    const existing = await pool.query('SELECT id FROM companies WHERE ruc = $1', [ruc])
    if (existing.rows.length) return res.status(409).json({ message: 'RUC already registered.' })

    const { rows } = await pool.query(
      `INSERT INTO companies (name, ruc, sector, country, city, status, owner_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, NOW(), NOW()) RETURNING *`,
      [name, ruc, sector, country, city, req.user.id],
    )
    const c = rows[0]
    res.status(201).json({
      id: c.id,
      name: c.name,
      ruc: c.ruc,
      sector: c.sector,
      country: c.country,
      city: c.city,
      status: c.status,
      ownerId: c.owner_id,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/companies/:companyId/collaborators/upload
router.post('/:companyId/collaborators/upload', async (req, res, next) => {
  try {
    const { companyId } = req.params
    const { collaborators } = req.body

    const company = await pool.query('SELECT * FROM companies WHERE id = $1', [companyId])
    if (!company.rows.length) return res.status(404).json({ message: 'Company not found.' })
    if (company.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ message: 'You do not have access to this company.' })
    }
    if (!Array.isArray(collaborators) || !collaborators.length) {
      return res.status(400).json({ message: 'Collaborators list is required and must not be empty.' })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const c of collaborators) {
        await client.query(
          `INSERT INTO collaborators (company_id, first_name, last_name, email, document_number, status)
           VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
          [companyId, c.firstName, c.lastName, c.email, c.documentNumber],
        )
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    res.status(202).json({ message: 'Collaborators uploaded successfully.' })
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/companies/:companyId/metrics
router.get('/:companyId/metrics', async (req, res, next) => {
  try {
    const { companyId } = req.params

    const company = await pool.query('SELECT * FROM companies WHERE id = $1', [companyId])
    if (!company.rows.length) {
      return res.status(404).json({ message: `Company with ID ${companyId} was not found.` })
    }
    if (company.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ message: 'You do not have access to this company.' })
    }

    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'ACTIVE')   AS active,
         COUNT(*) FILTER (WHERE status = 'INACTIVE') AS inactive,
         COUNT(*) FILTER (WHERE status = 'PENDING')  AS pending,
         COUNT(*)                                     AS total
       FROM collaborators WHERE company_id = $1`,
      [companyId],
    )

    const m = rows[0]
    if (Number(m.total) === 0) return res.status(204).send()

    res.json({
      companyId: Number(companyId),
      companyName: company.rows[0].name,
      totalCollaborators: Number(m.total),
      activeCollaborators: Number(m.active),
      inactiveCollaborators: Number(m.inactive),
      pendingCollaborators: Number(m.pending),
      lastUpdated: new Date().toISOString(),
    })
  } catch (err) {
    next(err)
  }
})

module.exports = router

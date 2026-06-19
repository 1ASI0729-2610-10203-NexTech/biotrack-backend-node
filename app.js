const express = require('express')
const cors = require('cors')

const authRoutes = require('./src/routes/auth')
const usersRoutes = require('./src/routes/users')
const profileRoutes = require('./src/routes/profile')
const nutritionalPlansRoutes = require('./src/routes/nutritional-plans')
const progressRoutes = require('./src/routes/progress')
const companiesRoutes = require('./src/routes/companies')
const subscriptionsRoutes = require('./src/routes/subscriptions')

const app = express()

app.use(
  cors({
    origin: ['https://biotrack-app-nextech.web.app', 'http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)

app.use(express.json())

app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/users', usersRoutes)
app.use('/api/v1/profile', profileRoutes)
app.use('/api/v1/nutritional-plans', nutritionalPlansRoutes)
app.use('/api/v1/progress', progressRoutes)
app.use('/api/v1/companies', companiesRoutes)
app.use('/api/v1/subscriptions', subscriptionsRoutes)

app.use((err, req, res, _next) => {
  console.error(err)
  res.status(500).json({ message: err.message || 'Internal server error.' })
})

module.exports = app

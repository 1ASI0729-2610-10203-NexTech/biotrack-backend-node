require('dotenv').config()
const https = require('https')
const fs = require('fs')
const app = require('./app')

const PORT = process.env.PORT || 3000
const HTTPS_PORT = process.env.HTTPS_PORT || 3443

app.listen(PORT, () => {
  console.log(`BioTrack API running on HTTP port ${PORT}`)
})

try {
  const options = {
    key: fs.readFileSync('/etc/ssl/private/biotrack.key'),
    cert: fs.readFileSync('/etc/ssl/certs/biotrack.crt'),
  }
  https.createServer(options, app).listen(HTTPS_PORT, () => {
    console.log(`BioTrack API running on HTTPS port ${HTTPS_PORT}`)
  })
} catch (e) {
  console.log('HTTPS not available:', e.message)
}

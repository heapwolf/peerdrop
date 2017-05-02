const https = require('https')
const path = require('path')
const fs = require('fs')

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8')

const opts = {
  key: read('./keys/key.pem'),
  cert: read('./keys/cert.pem'),
  rejectUnauthorized: false,
}

module.exports = cb => {
  const server = https.createServer(opts, cb)

  server.listen({ port: 9988 }, () => {
    console.log('https server up and running')
  })
}

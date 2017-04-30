const dgram = require('dgram')
const os = require('os')

const client = dgram.createSocket('udp4')
const server = dgram.createSocket('udp4')

const PORT = 4321
const MC = '224.0.0.1'

const fs = require('fs')
const path = require('path')
const avatar = fs.readFileSync(path.join(__dirname, 'avatar'))

function send (o) {
  const message = Buffer.from(JSON.stringify(o))
  client.send(message, 0, message.length, PORT, MC)
}

setInterval(() => {
  send({
    event: 'join',
    name: os.hostname(),
    platform: os.platform(),
    avatar: avatar
  })
}, 1500)

const registry = {}

//
// Create a tcp server
//

function joined (msg, rinfo) {
  //
  // If the peer is already rendered, just return
  //
  const selector = `[data-name="${msg.name}"]`
  if (document.querySelector(selector)) return

  const peers = document.querySelector('#peers')
  const peer = document.createElement('div')

  peer.className = 'peer'
  peer.setAttribute('data-name', msg.name)
  peer.setAttribute('data-ip', rinfo.address)
  peer.setAttribute('data-platform', msg.platform)

  peers.appendChild(peer)

  console.log(`${msg} discovered from ${rinfo.address}:${rinfo.port}`)
}

function parted (msg) {
  const selector = `[data-name="${msg.name}"]`
  const peer = document.querySelector(selector)
  if (peer) peer.parentNode.removeChild(peer)
  console.log(`${msg} has left the building`)
}

function cleanUp () {
  for (var key in registry) {
    if (registry[key] && Date.now() - registry[key] > 5e4) {
      parted(key)
      registry[key] = null
    }
  }
}

server.on('error', (err) => {
  console.log(`server error:\n${err.stack}`)
  server.close()
})

server.on('message', (msg, rinfo) => {
  msg = JSON.parse(msg)
  if (!registry[msg] && msg.event === 'join') {
    joined(msg, rinfo)
  }
  registry[msg] = Date.now()
})

server.on('listening', () => {
  console.log(`Listening on ${PORT}`)
})

server.bind(PORT)

setInterval(cleanUp, 5e4)

const dgram = require('dgram')
const os = require('os')
const dragDrop = require('drag-drop')
const body = require('stream-body')

const httpServer = require('./server')
const httpClient = require('https').request

const client = dgram.createSocket('udp4')
const server = dgram.createSocket('udp4')

const PORT = 4321
const MC = '224.0.0.1'

function send (o) {
  const message = Buffer.from(JSON.stringify(o))
  client.send(message, 0, message.length, PORT, MC)
}

//
// Advertise a message
//
setInterval(() => {
  send({
    event: 'join',
    name: os.hostname(),
    platform: os.platform(),
    ctime: Date.now()
  })
  console.log('send announcement')
}, 1500)

httpServer((req, res) => {
  if (req.method === 'POST') {
    body.parse(req, (err, data) => {
      if (err) return console.error(data)
    })
  } else {
    // TODO serve the app so people can download it
  }
})

const registry = {}

function getData (src, cb) {
  const reader = new window.FileReader()
  reader.onerror = err => cb(err)
  reader.onload = e => cb(null, e.target.result)
  reader.readAsBinaryString(src)
}

function onFilesDropped (ip, files) {
  files.forEach(file => {
    const opts = {
      host: ip,
      port: 9988,
      path: '/',
      method: 'POST',
      rejectUnauthorized: false
    }

    getData(file, (err, data) => {
      if (err) return console.error(err)
      httpClient(opts, res => {
        if (res.statusCode !== 200) {
          res.on('data', data => {
            console.error(res.statusCode, data)
          })
        }
      }).end(data)
    })
  })
}

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

  const avatar = document.createElement('img')
  avatar.src = 'assets/avatar-placeholder.svg'
  peer.appendChild(avatar)

  const name = document.createElement('address')
  name.textContent = msg.name
  name.title = rinfo.address
  peer.appendChild(name)

  peers.appendChild(peer)

  dragDrop(peer, (files) => {
    onFilesDropped(peer.getAttribute('data-ip'), files)
  })

  // remove inital empty message when finding peers
  const selectorEmptyState = document.querySelector('#empty-message')
  if (selectorEmptyState) selectorEmptyState.parentNode.removeChild(selectorEmptyState)

  console.log(msg, rinfo)
}

function parted (msg) {
  const selector = `.peer[data-name="${msg.name}"]`
  const peer = document.querySelector(selector)
  if (peer) peer.parentNode.removeChild(peer)
}

function cleanUp () {
  for (var key in registry) {
    console.log(Date.now() - registry[key].ctime, Date.now(), registry[key].ctime)
    if (registry[key] && (Date.now() - registry[key].ctime) > 9000) {
      parted(registry[key])
      registry[key] = null
    }
  }
}

server.on('error', (err) => {
  console.error(err)
  server.close()
})

server.on('message', (msg, rinfo) => {
  msg = JSON.parse(msg)
  if (!registry[msg.name] && msg.event === 'join') {
    joined(msg, rinfo)
  }
  registry[msg.name] = msg
})

server.on('listening', () => {
  console.log(`Listening on ${PORT}`)
})

server.bind(PORT)

setInterval(cleanUp, 9000)

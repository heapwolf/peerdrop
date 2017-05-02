const dgram = require('dgram')
const os = require('os')
const path = require('path')
const fs = require('fs')
const EventEmitter = require('events')
const clone = require('clone')
const uuidV4 = require('uuid/v4')
const progress = require('progress-stream')

var ProgressBar = require('progressbar.js')
const dragDrop = require('drag-drop')
const body = require('stream-body')
const { remote } = require('electron')
const dialog = remote.dialog
const win = remote.getCurrentWindow()

const httpServer = require('./server')
const httpClient = require('https').request

const client = dgram.createSocket({ type: 'udp4', reuseAddr: true })
const server = dgram.createSocket({ type: 'udp4', reuseAddr: true })

const PORT = 4321
const MC = '224.0.0.1'
const PROGRESS_REPORT_INTERVAL = 500
// should be a lot less than the report interval above, because if we
// interrupt an animation before it's ended the animation callback is not
// run and the success messages for files, except for the last one are not
// shown
const PROGRESS_ANIMATION_DURATION = 100

const transfers = {
  /*
 * id: {
 *   id,
 *   from,
 *   started,
 *   filename,
 *   filesize,
 *   finished
 *   error: object|null
 *   progress: https://www.npmjs.com/package/progress-stream#progress
 * }
 */
}
const transfersEmitter = new EventEmitter()

function updateTransfer(id, fields) {
  if (!transfers[id]) {
    transfers[id] = fields
  }
  const old = clone(transfers[id])
  Object.assign(transfers[id], fields)
  if (transfers[id].progress) {
    console.log(
      `${Math.round(transfers[id].progress.percentage)}% ­ ${transfers[id].filename}`
    )
  }
  transfersEmitter.emit('change', old, transfers[id])
}

function humanHostname(hostname) {
  return hostname.replace(/\.local/g, '')
}

function send(o) {
  const message = Buffer.from(JSON.stringify(o))
  client.send(message, 0, message.length, PORT, MC)
}

document.body.classList.add(process.platform)

//
// Dont accept arbitrary drops
//
dragDrop(document.body, () => {})

//
// Advertise a message
//
setInterval(ping, 1500)

function ping(extraAttrs = {}) {
  const attrs = Object.assign(
    {},
    {
      event: 'join',
      name: humanHostname(os.hostname()),
      platform: os.platform(),
      ctime: Date.now(),
    },
    extraAttrs
  )

  send(attrs)
}

//
// Add a close button
//
const close = document.querySelector('.close')
close.addEventListener('click', () => {
  remote.app.exit()
})

const me = document.querySelector('#me')
try {
  const d = fs.readFileSync(path.join(os.homedir(), 'avatar'))
  me.style.backgroundImage = 'url("' + d + '")'
  me.textContent = ''
} catch (ex) {
  me.textContent = os.hostname()
}

//
// Drop your avatar
//
dragDrop(me, files => {
  const reader = new window.FileReader()
  reader.onerror = err => {
    console.error(err)
  }
  reader.onload = e => {
    me.style.backgroundImage = 'url("' + e.target.result + '")'
    me.textContent = ''

    fs.writeFileSync(path.join(os.homedir(), 'avatar'), e.target.result)
    ping({ refreshAvatar: true })
  }
  reader.readAsDataURL(files[0])
})

//
// Add our hostname to the `me` icon.
//

httpServer((req, res) => {
  const filename = req.headers['x-filename']

  if (req.url === '/upload') {
    const message = [
      'Do you want to accept the file',
      filename,
      'from',
      humanHostname(req.headers['x-from']) + '?',
    ].join(' ')

    const opts = {
      type: 'question',
      buttons: ['Ok', 'Cancel'],
      title: 'Confirm',
      message,
    }

    const result = dialog.showMessageBox(win, opts)

    if (result === 0) {
      const dest = path.join(remote.app.getPath('downloads'), filename)
      const writeStream = fs.createWriteStream(dest)
      const transfer = {
        id: uuidV4(),
        started: Date.now(),
        filename: req.headers['x-filename'],
        filesize: req.headers['x-filesize'],
        from: humanHostname(req.headers['x-from']),
        error: null,
        progress: null,
        finished: false,
      }
      updateTransfer(transfer.id, transfer)

      const progressStream = progress({
        length: transfer.filesize,
        time: PROGRESS_REPORT_INTERVAL /* ms */,
      })
      progressStream.on('progress', progress => {
        updateTransfer(transfer.id, { progress })
      })
      console.log(
        `Staring download from ${transfer.from}, filename: ${transfer.filename}, size ${transfer.filesize} bytes, id ${transfer.id}`
      )
      req.pipe(progressStream).pipe(writeStream)
    } else if (result === 1) {
      res.statusCode = 403
      return res.end('User rejected the upload')
    }
  } else if (req.url === '/avatar') {
    const filepath = path.join(os.homedir(), 'avatar')
    fs.readFile(filepath, (err, data) => {
      if (err) {
        res.statusCode = 404
        return res.end('')
      }
      res.end(data)
    })
  } else if (req.url === '/linux') {
    // TODO serve the app so people can download it
  } else if (req.url === '/mac') {
  } else if (req.url === '/win') {
  }
})

const registry = {}

function getData(src, cb) {
  const reader = new window.FileReader()
  reader.onerror = err => cb(err)
  reader.onload = e => cb(null, e.target.result)
  reader.readAsArrayBuffer(src)
}

function onFilesDropped(msg, files) {
  files.forEach(file => {
    const opts = {
      host: msg.ip,
      port: 9988,
      path: '/upload',
      method: 'POST',
      rejectUnauthorized: false,
      headers: {
        'Content-Type': file.type,
        'x-filename': file.name,
        'x-from': os.hostname(),
        'x-filesize': file.size,
      },
    }

    getData(file, (err, data) => {
      if (err) return console.error(err)
      const req = httpClient(opts, res => {
        if (res.statusCode === 403) {
          showRejectedMessage(msg)
          return
        }
        if (res.statusCode !== 200) {
          res.on('data', data => {
            console.error(res.statusCode, data)
          })
        }
      })

      req.end(Buffer.from(data))
    })
  })
}

//
// Create a tcp server
//

function joined(msg, rinfo) {
  const me = humanHostname(os.hostname())
  msg.name = humanHostname(msg.name)

  //
  // Don't show me my own machine as a peer
  //
  if (!process.env['DEBUG'] && msg.name === me) {
    return
  }

  //
  // If the peer is already rendered, just return
  //
  const selector = `[data-name="${msg.name}"]`
  if (document.querySelector(selector)) return

  //
  // Otherwise, create a peer and add it to the list.
  //
  const peers = document.querySelector('#peers')
  const barElement = document.createElement('div')
  barElement.className = 'bar'
  const peer = document.createElement('div')
  peer.appendChild(barElement)

  peer.className = 'peer adding adding-anim'
  peer.setAttribute('data-name', msg.name)
  peer.setAttribute('data-ip', rinfo.address)
  peer.setAttribute('data-platform', msg.platform)

  const avatar = document.createElement('div')
  avatar.className = 'avatar ' + msg.platform
  peer.appendChild(avatar)

  const name = document.createElement('address')
  name.textContent = msg.name
  name.address = rinfo.address
  peer.appendChild(name)

  const progressBar = new ProgressBar.Circle(barElement, {
    strokeWidth: 6,
    easing: 'easeInOut',
    duration: PROGRESS_ANIMATION_DURATION,
    color: '#ED6A5A',
    trailColor: 'transparent',
    trailWidth: 1,
    svgStyle: null,
  })

  transfersEmitter.on('change', (old, current) => {
    if (current.from !== msg.name) {
      return
    }
    const activeForMe = Object.values(transfers).filter(
      t =>
        t.from === msg.name &&
        t.progress &&
        (t.progress.percentage < 100 ||
          old.progress === null ||
          old.id === t.id) &&
        !t.finished
    )
    if (activeForMe.length === 0) {
      return
    }
    const progress =
      activeForMe.reduce((a, v) => a + v.progress.transferred, 0) /
      activeForMe.reduce((a, v) => a + v.progress.length, 0)
    progressBar.animate(progress, () => {
      if (
        current.progress &&
        current.progress.percentage == 100 &&
        !current.finished
      ) {
        const opts = {
          type: 'info',
          buttons: ['Ok'],
          title: 'Downloaded',
          message: `✅ The file ${current.filename} was successfully downloaded.`,
        }
        dialog.showMessageBox(win, opts)
        updateTransfer(current.id, { finished: true })
      }
      if (progress >= 1.0) {
        progressBar.set(0)
      }
    })
  })

  peers.appendChild(peer)

  window.requestAnimationFrame(() =>
    requestAnimationFrame(() => peer.classList.remove('adding'))
  )
  peer.addEventListener('transitionend', e => {
    if (e.propertyName !== 'transform') return
    peer.classList.remove('adding-anim')
  })
  //
  // Add a drag drop event to the peer
  //
  dragDrop(peer, files => {
    onFilesDropped(registry[peer.getAttribute('data-name')], files)
  })

  //
  // Get the avatar from the user who joined
  //
  loadAvatar(rinfo.address, peer)

  //
  // remove inital empty message when finding peers
  //
  const selectorEmptyState = document.querySelector('#empty-message')
  selectorEmptyState.classList.remove('show')
}

function parted(msg) {
  const selector = `.peer[data-name="${msg.name}"]`
  const peer = document.querySelector(selector)
  if (peer) peer.parentNode.removeChild(peer)
}

function showRejectedMessage(msg) {
  const opts = {
    type: 'info',
    buttons: ['Ok'],
    title: 'Rejected',
    message: `${msg.name} rejected the file.`,
  }

  dialog.showMessageBox(win, opts)
}

function cleanUp() {
  for (var key in registry) {
    if (registry[key] && Date.now() - registry[key].ctime > 9000) {
      parted(registry[key])
      registry[key] = null
    }
  }
}

server.on('error', err => {
  console.error(err)
  server.close()
})

server.on('message', (msg, rinfo) => {
  msg = JSON.parse(msg)
  if (!registry[msg.name] && msg.event === 'join') {
    joined(msg, rinfo)
  }

  if (msg.refreshAvatar) {
    const selector = `.peer[data-name="${msg.name}"]`
    loadAvatar(rinfo.address, document.querySelector(selector))
  }
  msg.ip = rinfo.address
  registry[msg.name] = msg
})

function loadAvatar(address, peerEl) {
  const opts = {
    host: address,
    port: 9988,
    path: '/avatar',
    rejectUnauthorized: false,
  }

  const req = httpClient(opts, res => {
    if (res.statusCode !== 200) {
      return console.error('Unable to get avatar')
    }

    body.parse(res, (err, data) => {
      if (err) return console.error('unable to get avatar')

      const avatar = peerEl.querySelector('.avatar')
      avatar.className = 'avatar'

      peerEl.style.backgroundImage = 'url("' + data + '")'
    })
  })

  req.end()
}

server.on('listening', () => {
  console.log(`Listening on ${PORT}`)
})

server.bind(PORT)

setInterval(cleanUp, 5000)

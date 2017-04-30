const path = require('path')
const { app, BrowserWindow, globalShortcut } = require('electron')

const backgroundColor = '#ffffff'

const windowOptions = {
  width: 800,
  height: 500,
  backgroundColor,
  center: true,
  frame: true,
  minHeight: 500,
  minWidth: 800,
  title: 'Peerdrop'
}

if (process.platform === 'darwin') {
  windowOptions.frame = false
}

app.on('ready', () => {
  const mainWindow = new BrowserWindow(windowOptions)
  mainWindow.loadURL('file://' + path.join(__dirname, 'index.html'))

  if (process.platform !== 'darwin') {
    mainWindow.setMenu(null)
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      mainWindow.openDevTools()
    })
  }
})

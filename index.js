const path = require('path')
const { app, BrowserWindow } = require('electron')

const backgroundColor = '#ffffff'

const windowOptions = {
  width: 600,
  height: 400,
  backgroundColor,
  center: true
}

app.on('ready', () => {
  const mainWindow = new BrowserWindow(windowOptions)
  mainWindow.loadURL('file://' + path.join(__dirname, 'index.html'))
})

#!/usr/bin/env node

const os = require('os')
const fs = require('fs')
const path = require('path')

const platform = os.platform()
const appNames = ['Ito-dev', 'Ito-local', 'Ito-prod', 'Ito']

function getAppDataPath(appName) {
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName)
  } else if (platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      appName,
    )
  } else {
    return path.join(os.homedir(), '.config', appName.toLowerCase())
  }
}

for (const appName of appNames) {
  const appDataPath = getAppDataPath(appName)
  if (fs.existsSync(appDataPath)) {
    fs.rmSync(appDataPath, { recursive: true, force: true })
    console.log(`✓ Removed app data from: ${appDataPath}`)
  } else {
    console.log(`ℹ No app data found at: ${appDataPath}`)
  }
}

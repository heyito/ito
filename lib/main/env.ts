import { app } from 'electron'
import path from 'path'

let stage = process.env.ITO_ENV || import.meta.env.VITE_ITO_ENV
if (!stage && import.meta.env.DEV) {
  stage = 'local'
}
if (!stage) {
  throw new Error('ITO_ENV or VITE_ITO_ENV must be set to dev or prod')
}

const userDataDir = path.join(app.getPath('appData'), `Ito-${stage}`)
app.setPath('userData', userDataDir)

if (stage !== 'prod') {
  app.setName(`Ito (${stage})`)
}

export const ITO_ENV = stage

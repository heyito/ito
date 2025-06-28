import { ipcMain } from 'electron'
import { revertLastMigration, wipeDatabase } from '../main/sqlite/db'

export function registerDevIPC() {
  ipcMain.handle('dev:revert-last-migration', async () => {
    console.log('Received dev:revert-last-migration IPC call.')
    try {
      await revertLastMigration()
      return { success: true }
    } catch (error) {
      console.error('Failed to revert last migration:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('dev:wipe-database', async () => {
    console.log('Received dev:wipe-database IPC call.')
    try {
      await wipeDatabase()
      return { success: true }
    } catch (error) {
      console.error('Failed to wipe database:', error)
      return { success: false, error: (error as Error).message }
    }
  })
}

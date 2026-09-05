import { autoUpdater } from 'electron-updater'
import { app, dialog, BrowserWindow, shell } from 'electron'
import logger from './logger.js'
import {
  UPDATE_CHECK_INITIAL_DELAY,
  UPDATE_CHECK_INTERVAL,
  MAC_BUILD_SIGNED
} from '../config/constants.js'

const log = logger.child({ module: 'updater' })

export const RELEASES_URL = 'https://github.com/sorenwacker/ordo/releases/latest'
export const SKIPPED_UPDATE_VERSION_KEY = 'skipped-update-version'

// Resolved lazily on every use: on macOS the window can be closed and
// recreated while the app (and this module) keeps running.
function getMainWindow() {
  const win = BrowserWindow.getAllWindows()[0]
  return win && !win.isDestroyed() ? win : null
}

/**
 * Decide whether the manual-update dialog should be shown for a version.
 *
 * @param {string} version - The version reported as available.
 * @param {string|null} skippedVersion - Version the user chose to skip.
 * @param {Set<string>} promptedVersions - Versions already prompted this run.
 * @returns {boolean} True when the dialog should be shown.
 */
export function shouldPromptForUpdate(version, skippedVersion, promptedVersions) {
  return version !== skippedVersion && !promptedVersions.has(version)
}

/**
 * Configure update checking. On platforms where installing is possible
 * (Windows, Linux, signed macOS) updates download and install automatically.
 * Unsigned macOS builds cannot be installed by Squirrel.Mac, so there the
 * updater only notifies — once per version — and links to the releases
 * page. See docs/auto-update.md.
 *
 * @param {Object} database - Database instance, used to persist skipped versions.
 * @param {string} [platform] - Overridable for tests; defaults to process.platform.
 */
export function initAutoUpdater(database, platform = process.platform) {
  const manualMode = platform === 'darwin' && !MAC_BUILD_SIGNED

  autoUpdater.autoDownload = !manualMode
  autoUpdater.autoInstallOnAppQuit = !manualMode

  // Check for updates on startup (with delay to not slow down launch)
  setTimeout(() => {
    checkForUpdates()
  }, UPDATE_CHECK_INITIAL_DELAY)

  setInterval(() => {
    checkForUpdates()
  }, UPDATE_CHECK_INTERVAL)

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...')
    sendStatusToWindow('checking')
  })

  autoUpdater.on('update-not-available', (info) => {
    log.info('No updates available', { version: info.version })
    sendStatusToWindow('not-available', info)
  })

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error', { error: err.message })
    sendStatusToWindow('error', { message: err.message })
  })

  if (manualMode) {
    const promptedVersions = new Set()

    autoUpdater.on('update-available', async (info) => {
      const skippedVersion = database.getSetting(SKIPPED_UPDATE_VERSION_KEY)
      if (!shouldPromptForUpdate(info.version, skippedVersion, promptedVersions)) {
        return
      }
      promptedVersions.add(info.version)
      log.info('Update available, manual install required', { version: info.version })
      sendStatusToWindow('available', info)

      const options = {
        type: 'info',
        title: 'Update Available',
        message: `Version ${info.version} is available (you have ${app.getVersion()}).`,
        detail:
          'This build cannot install updates automatically. ' +
          'Download the new version from the releases page and install it manually.',
        buttons: ['Download', 'Later', 'Skip This Version'],
        defaultId: 0,
        cancelId: 1
      }
      const win = getMainWindow()
      const { response } = await (win
        ? dialog.showMessageBox(win, options)
        : dialog.showMessageBox(options))
      if (response === 0) {
        shell.openExternal(RELEASES_URL)
      } else if (response === 2) {
        database.setSetting(SKIPPED_UPDATE_VERSION_KEY, info.version)
      }
    })
    return
  }

  autoUpdater.on('update-available', (info) => {
    log.info('Update available', { version: info.version })
    sendStatusToWindow('available', info)
  })

  autoUpdater.on('download-progress', (progress) => {
    log.info('Download progress', { percent: Math.round(progress.percent) })
    sendStatusToWindow('downloading', {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded', { version: info.version })
    sendStatusToWindow('downloaded', info)

    const win = getMainWindow()
    if (win) {
      dialog
        .showMessageBox(win, {
          type: 'info',
          title: 'Update Ready',
          message: `Version ${info.version} has been downloaded.`,
          detail: 'The update will be installed when you restart the app.',
          buttons: ['Restart Now', 'Later'],
          defaultId: 0,
          cancelId: 1
        })
        .then(({ response }) => {
          if (response === 0) {
            autoUpdater.quitAndInstall(false, true)
          }
        })
    }
  })
}

export function checkForUpdates() {
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch((err) => {
      log.error('Failed to check for updates', { error: err.message })
    })
  } else {
    log.info('Skipping update check in development mode')
  }
}

function sendStatusToWindow(status, data = {}) {
  const win = getMainWindow()
  if (win) {
    win.webContents.send('update-status', { status, ...data })
  }
}

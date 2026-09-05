import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'

/**
 * Files worth carrying from the previous userData directory: the database
 * itself, its write-ahead log and shared memory files, and any backups the
 * app made. Everything else in userData is Electron's own cache.
 *
 * @param {string} name - File name to test.
 * @returns {boolean} True when the file belongs to the database.
 */
function isDatabaseFile(name) {
  return name.startsWith('todos.db') || /^todos-(backup|premigrate)-.*\.db$/.test(name)
}

/**
 * Copy a previous release's database into the current userData directory.
 *
 * Electron derives userData from productName, so renaming the application
 * points it at a fresh, empty directory while the user's real database stays
 * behind under the old name. This copies that data forward on first launch.
 *
 * The copy is non-destructive: the legacy directory is left untouched, so an
 * older build still opens its own data if the user goes back.
 *
 * @param {Object} options
 * @param {string} options.userDataPath - Current userData directory.
 * @param {string} options.legacyPath - Directory the previous name used.
 * @param {Object} [options.log] - Logger with info/warn methods.
 * @returns {{migrated: boolean, reason?: string, files?: string[]}} Outcome,
 *   where `reason` explains why nothing was copied and `files` lists what was.
 */
export function migrateLegacyUserData({ userDataPath, legacyPath, log } = {}) {
  if (resolve(userDataPath) === resolve(legacyPath)) {
    return { migrated: false, reason: 'same-directory' }
  }
  if (existsSync(join(userDataPath, 'todos.db'))) {
    return { migrated: false, reason: 'target-exists' }
  }
  if (!existsSync(join(legacyPath, 'todos.db'))) {
    return { migrated: false, reason: 'no-legacy-data' }
  }

  const files = readdirSync(legacyPath).filter(isDatabaseFile)
  mkdirSync(userDataPath, { recursive: true })
  for (const file of files) {
    copyFileSync(join(legacyPath, file), join(userDataPath, file))
  }

  log?.info?.('Migrated database from the previous application name', {
    from: legacyPath,
    to: userDataPath,
    files: files.length
  })
  return { migrated: true, files }
}

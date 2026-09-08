import { homedir } from 'os'
import { join } from 'path'

/**
 * Directory the application stores its data in. Electron derives userData
 * from the application name, so this must track `name` in the root
 * package.json; a mismatch points the server at a database the app no longer
 * opens. See docs/renaming.md.
 */
export const APP_DATA_DIR = 'ordo'

const DB_FILE = 'todos.db'

/**
 * Platform default database path, matching what the application resolves.
 *
 * @param {string} platform - Node platform identifier.
 * @param {Object} env - Environment variables.
 * @param {string} home - Home directory.
 * @returns {string} Absolute path to the database file.
 */
function defaultDbPath(platform, env, home) {
  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', APP_DATA_DIR, DB_FILE)
  }
  if (platform === 'win32') {
    return join(env.APPDATA || join(home, 'AppData', 'Roaming'), APP_DATA_DIR, DB_FILE)
  }
  return join(env.XDG_CONFIG_HOME || join(home, '.config'), APP_DATA_DIR, DB_FILE)
}

/**
 * Resolve the database the server should open.
 *
 * `TODO_DB_PATH` predates the rename and is deprecated; it is reported as the
 * source so the caller can say so on stderr rather than failing silently.
 *
 * @param {Object} [options]
 * @param {Object} [options.env] - Environment variables.
 * @param {string} [options.platform] - Node platform identifier.
 * @param {string} [options.home] - Home directory.
 * @returns {{path: string, source: 'ORDO_DB_PATH'|'TODO_DB_PATH'|'default'}}
 *   Resolved path and which rule produced it.
 */
export function resolveDbPath({
  env = process.env,
  platform = process.platform,
  home = homedir()
} = {}) {
  if (env.ORDO_DB_PATH) {
    return { path: env.ORDO_DB_PATH, source: 'ORDO_DB_PATH' }
  }
  if (env.TODO_DB_PATH) {
    return { path: env.TODO_DB_PATH, source: 'TODO_DB_PATH' }
  }
  return { path: defaultDbPath(platform, env, home), source: 'default' }
}

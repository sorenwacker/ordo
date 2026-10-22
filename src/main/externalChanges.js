/**
 * Detects commits made to the database by another process.
 *
 * The MCP server shares the database file with the app and keeps its own
 * connection open. On macOS a directory watch (fs.watch) receives no
 * content-change events for a file another process keeps open and writes to
 * repeatedly, so the WAL appends of such a writer go unnoticed. SQLite's
 * data_version pragma is the reliable signal: it changes when another
 * connection commits and is unaffected by this connection's own commits.
 * See docs/mcp-server.md.
 */

/**
 * Poll the database's data_version and report external commits.
 *
 * @param {Object} options
 * @param {{getDataVersion: () => number}} options.database - Open database
 *   whose connection the app writes through.
 * @param {() => void} options.onChange - Called once per poll in which the
 *   data version differs from the previous poll.
 * @param {number} options.intervalMs - Poll interval in milliseconds.
 * @param {{warn: Function}} options.log - Logger for failed reads.
 * @returns {() => void} Stops the polling.
 */
export function startExternalChangeWatcher({ database, onChange, intervalMs, log }) {
  let lastVersion = readVersion(database, log)
  const timer = setInterval(() => {
    const version = readVersion(database, log)
    if (version === null || version === lastVersion) return
    lastVersion = version
    onChange()
  }, intervalMs)
  return () => clearInterval(timer)
}

/**
 * Read the data version, reporting failures instead of throwing out of the
 * interval callback.
 *
 * @param {{getDataVersion: () => number}} database
 * @param {{warn: Function}} log
 * @returns {number|null} The version, or null when the read failed.
 */
function readVersion(database, log) {
  try {
    return database.getDataVersion()
  } catch (error) {
    log.warn('Could not read database data_version', { error: error.message })
    return null
  }
}

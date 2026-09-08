import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveDbPath, APP_DATA_DIR } from '../mcp-server/dbPath.js'

// The MCP server resolves the database path on its own, without Electron.
// That resolution silently drifted from the app once the application was
// renamed, leaving the server on the previous name's database while the app
// used the new one. These gates fail if the two ever diverge again.

describe('MCP database path', () => {
  const home = '/home/tester'

  it('prefers ORDO_DB_PATH', () => {
    const env = { ORDO_DB_PATH: '/explicit/ordo.db', TODO_DB_PATH: '/legacy/todo.db' }
    expect(resolveDbPath({ env, platform: 'linux', home })).toEqual({
      path: '/explicit/ordo.db',
      source: 'ORDO_DB_PATH'
    })
  })

  it('still honours TODO_DB_PATH, reporting it as the deprecated source', () => {
    const env = { TODO_DB_PATH: '/legacy/todo.db' }
    expect(resolveDbPath({ env, platform: 'linux', home })).toEqual({
      path: '/legacy/todo.db',
      source: 'TODO_DB_PATH'
    })
  })

  it('falls back to the platform default under the current application name', () => {
    expect(resolveDbPath({ env: {}, platform: 'darwin', home })).toEqual({
      path: join(home, 'Library', 'Application Support', 'ordo', 'todos.db'),
      source: 'default'
    })
    expect(
      resolveDbPath({ env: { APPDATA: 'C:\\Users\\t\\AppData\\Roaming' }, platform: 'win32', home })
        .path
    ).toBe(join('C:\\Users\\t\\AppData\\Roaming', 'ordo', 'todos.db'))
    expect(resolveDbPath({ env: { XDG_CONFIG_HOME: '/xdg' }, platform: 'linux', home }).path).toBe(
      join('/xdg', 'ordo', 'todos.db')
    )
  })

  it('uses the same directory name the application derives its userData from', () => {
    const root = join(import.meta.dirname, '..')
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    expect(APP_DATA_DIR).toBe(pkg.name)
    // The app hardcodes the same name for its development userData override.
    const main = readFileSync(join(root, 'src/main/index.js'), 'utf8')
    expect(main).toContain(`join(app.getPath('appData'), '${APP_DATA_DIR}')`)
  })

  it('does not resolve the directory the application used before the rename', () => {
    const { path } = resolveDbPath({ env: {}, platform: 'darwin', home })
    expect(path).not.toContain('Support/todo/')
  })
})

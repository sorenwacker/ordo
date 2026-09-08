#!/usr/bin/env node
/**
 * Standalone MCP server for the Ordo database. Speaks MCP over stdio.
 * See docs/mcp-server.md.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { createTools } from './tools.js'
import { resolveDbPath } from './dbPath.js'

// stdout is the MCP protocol channel. The app logger writes info to stdout,
// so it must be silenced to errors (stderr) BEFORE database.js loads —
// hence the dynamic import below instead of a static one.
process.env.LOG_LEVEL = 'error'
const { Database } = await import('../src/main/database.js')
// Use this package's own better-sqlite3 (built for system Node); the root
// node_modules copy is rebuilt for Electron's ABI by dev/build.
const { default: BetterSqlite3 } = await import('better-sqlite3')

const { path: dbPath, source } = resolveDbPath()
if (source === 'TODO_DB_PATH') {
  // stderr, never stdout: stdout carries the MCP protocol.
  process.stderr.write('TODO_DB_PATH is deprecated; use ORDO_DB_PATH instead.\n')
}
const db = new Database(dbPath, { driver: BetterSqlite3 })
const tools = createTools(db)

const server = new Server({ name: 'ordo', version: '0.1.0' }, { capabilities: { tools: {} } })

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = tools.find((t) => t.name === request.params.name)
  if (!tool) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
      isError: true
    }
  }
  try {
    const result = await tool.handler(request.params.arguments ?? {})
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (error) {
    return { content: [{ type: 'text', text: error.message }], isError: true }
  }
})

await server.connect(new StdioServerTransport())

/**
 * Application constants and configuration values
 */

// History configuration
export const HISTORY_MAX_SIZE = 50

// Update intervals (in milliseconds)
export const UPDATE_CHECK_INITIAL_DELAY = 5000
export const UPDATE_CHECK_INTERVAL = 4 * 60 * 60 * 1000 // 4 hours

// How often the main process polls SQLite's data_version for commits made by
// another process, such as the MCP server (see docs/mcp-server.md).
export const EXTERNAL_CHANGE_POLL_INTERVAL = 1000

// Squirrel.Mac refuses to install unsigned builds, so unsigned macOS uses a
// notify-only updater. Set to true once Developer ID signing is configured
// (see docs/auto-update.md).
export const MAC_BUILD_SIGNED = false

// Field length limits
export const MAX_LENGTH = {
  TODO_TITLE: 500,
  PROJECT_NAME: 200,
  STATUS_NAME: 100,
  TAG_NAME: 100,
  SEARCH_QUERY: 500,
  TODO_NOTES: 100000,
  OPTIONAL_STRING: 50000,
  GENERIC_STRING: 1000
}

// Array size limits
export const MAX_ARRAY_SIZE = {
  IDS: 10000,
  RECURRENCE_INTERVAL: 365,
  POSITIVE_INT: 1000000
}

// Default colors
export const DEFAULT_COLORS = {
  PROJECT: '#0f4c75'
}

// File size limits (in bytes)
export const MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024 // 50MB

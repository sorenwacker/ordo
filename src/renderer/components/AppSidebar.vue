<template>
  <aside
    class="sidebar"
    :class="{ 'light-theme': theme === 'light' }"
    @mouseleave="onMouseLeave && onMouseLeave()"
    @mouseenter="onMouseEnter && onMouseEnter()"
  >
    <div class="sidebar-header">
      <h2>Ordo</h2>
      <button
        class="pin-btn"
        :class="{ pinned: pinned }"
        :title="pinned ? 'Unpin sidebar' : 'Pin sidebar'"
        @click="$emit('toggle-pin')"
      >
        <svg
          v-if="pinned"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="none"
        >
          <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2z" />
        </svg>
        <svg
          v-else
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2z" />
        </svg>
      </button>
    </div>

    <nav class="project-nav">
      <div
        class="nav-item"
        :class="{ active: currentFilter === null }"
        @click="$emit('set-filter', null)"
      >
        <List :size="16" class="nav-icon" />
        <span>All</span>
        <span class="count">{{ formatProgress(allCount) }}</span>
      </div>

      <div
        class="nav-item"
        :class="{ active: currentFilter === 'archive' }"
        @click="$emit('set-filter', 'archive')"
      >
        <Archive :size="16" class="nav-icon" />
        <span>Archive</span>
        <span v-if="archiveCount > 0" class="count">{{ archiveCount }}</span>
      </div>

      <div
        class="nav-item trash-nav"
        :class="{ active: currentFilter === 'trash' }"
        @click="$emit('set-filter', 'trash')"
      >
        <Trash2 :size="16" class="nav-icon" />
        <span>Trash</span>
        <span v-if="trashCount > 0" class="count">{{ trashCount }}</span>
      </div>

      <div class="nav-divider"></div>

      <div class="add-project">
        <input
          v-if="projectInput.showInput.value"
          :ref="(el) => (projectInput.inputRef.value = el)"
          v-model="projectInput.inputValue.value"
          placeholder="Project name..."
          type="text"
          @keyup.enter="projectInput.add"
          @blur="projectInput.cancelOnBlur"
        />
        <button v-else @click="projectInput.showAdd">+ Add Project</button>
      </div>

      <draggable
        :model-value="projects"
        item-key="id"
        class="projects-list"
        @update:model-value="$emit('update:projects', $event)"
        @end="$emit('projects-reorder')"
      >
        <template #item="{ element: project }">
          <div
            class="nav-item project-item"
            :class="{ active: currentFilter === project.id }"
            @click="$emit('set-filter', project.id)"
          >
            <span class="project-dot" :style="{ background: project.color }"></span>
            <span class="project-name">{{ project.name }}</span>
            <span class="count">{{ formatProgress(getProjectCount(project.id)) }}</span>
            <button
              class="edit-btn"
              title="Edit project"
              @click.stop="$emit('edit-project', project)"
            >
              ...
            </button>
          </div>
        </template>
      </draggable>
    </nav>

    <div
      class="sidebar-header status-header collapsible"
      @click.stop="statusesCollapsed = !statusesCollapsed"
    >
      <ChevronRight v-if="statusesCollapsed" :size="14" class="collapse-icon" />
      <ChevronDown v-else :size="14" class="collapse-icon" />
      <h2>Statuses</h2>
    </div>

    <nav v-show="!statusesCollapsed" class="status-nav">
      <draggable
        :model-value="statuses"
        item-key="id"
        class="statuses-list"
        @update:model-value="$emit('update:statuses', $event)"
        @end="$emit('statuses-reorder')"
      >
        <template #item="{ element: status }">
          <div class="nav-item status-item" @click="$emit('edit-status', status)">
            <span class="status-dot" :style="{ background: status.color }"></span>
            <span class="status-name">{{ status.name }}</span>
            <span class="count">{{ getStatusCount(status.id) }}</span>
          </div>
        </template>
      </draggable>
    </nav>

    <div v-show="!statusesCollapsed" class="add-status">
      <input
        v-if="statusInput.showInput.value"
        :ref="(el) => (statusInput.inputRef.value = el)"
        v-model="statusInput.inputValue.value"
        placeholder="Status name..."
        type="text"
        @keyup.enter="statusInput.add"
        @blur="statusInput.cancelOnBlur"
      />
      <button v-else @click="statusInput.showAdd">+ Add Status</button>
    </div>

    <div class="settings-section">
      <div
        class="sidebar-header settings-header collapsible"
        @click.stop="settingsCollapsed = !settingsCollapsed"
      >
        <ChevronRight v-if="settingsCollapsed" :size="14" class="collapse-icon" />
        <ChevronDown v-else :size="14" class="collapse-icon" />
        <h2>Settings</h2>
      </div>
      <div v-show="!settingsCollapsed" class="settings-content">
        <div class="preference-item timezone-item">
          <label class="preference-label">Timezone</label>
          <select
            :value="timezone"
            class="timezone-select"
            @change="$emit('update:timezone', $event.target.value)"
          >
            <option value="auto">Auto ({{ detectedTimezone }})</option>
            <option v-for="tz in commonTimezones" :key="tz" :value="tz">{{ tz }}</option>
          </select>
        </div>
        <button class="settings-btn" @click="$emit('export')">Export</button>
        <button class="settings-btn" @click="$emit('show-import')">Import</button>
        <button class="settings-btn danger-btn" @click="$emit('show-reset-database')">
          Reset Database
        </button>
        <div class="database-location">
          <small>Database: {{ databasePath }}</small>
        </div>
        <div v-if="appVersion" class="app-version">
          <small>Version: {{ appVersion }}</small>
        </div>
      </div>
    </div>
  </aside>
</template>

<script>
  import draggable from 'vuedraggable'
  import { List, Archive, Trash2, ChevronRight, ChevronDown } from 'lucide-vue-next'
  import { useAddInput } from '../composables/useAddInput'

  export default {
    name: 'AppSidebar',
    components: {
      draggable,
      List,
      Archive,
      Trash2,
      ChevronRight,
      ChevronDown
    },
    props: {
      pinned: { type: Boolean, default: true },
      theme: { type: String, default: 'dark' },
      onMouseLeave: { type: Function, default: null },
      onMouseEnter: { type: Function, default: null },
      currentFilter: { type: [Number, String], default: null },
      projects: { type: Array, default: () => [] },
      statuses: { type: Array, default: () => [] },
      allCount: { type: Object, default: () => ({ done: 0, total: 0 }) },
      trashCount: { type: Number, default: 0 },
      archiveCount: { type: Number, default: 0 },
      projectCounts: { type: Object, default: () => ({}) },
      statusCounts: { type: Object, default: () => ({}) },
      timezone: { type: String, default: 'auto' },
      databasePath: { type: String, default: '' },
      appVersion: { type: String, default: '' }
    },
    emits: [
      'set-filter',
      'update:projects',
      'projects-reorder',
      'add-project',
      'edit-project',
      'update:statuses',
      'statuses-reorder',
      'add-status',
      'edit-status',
      'update:timezone',
      'export',
      'show-import',
      'show-reset-database',
      'toggle-pin'
    ],
    setup(props, { emit }) {
      const projectInput = useAddInput('project', emit)
      const statusInput = useAddInput('status', emit)

      return {
        projectInput,
        statusInput
      }
    },
    data() {
      return {
        statusesCollapsed: localStorage.getItem('statuses-collapsed') !== 'false',
        settingsCollapsed: localStorage.getItem('settings-collapsed') !== 'false',
        commonTimezones: [
          'UTC',
          'America/New_York',
          'America/Chicago',
          'America/Denver',
          'America/Los_Angeles',
          'America/Anchorage',
          'Pacific/Honolulu',
          'Europe/London',
          'Europe/Paris',
          'Europe/Berlin',
          'Europe/Moscow',
          'Asia/Dubai',
          'Asia/Kolkata',
          'Asia/Singapore',
          'Asia/Tokyo',
          'Asia/Shanghai',
          'Australia/Sydney',
          'Pacific/Auckland'
        ]
      }
    },
    computed: {
      detectedTimezone() {
        return Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    },
    watch: {
      statusesCollapsed(val) {
        localStorage.setItem('statuses-collapsed', val)
      },
      settingsCollapsed(val) {
        localStorage.setItem('settings-collapsed', val)
      }
    },
    methods: {
      formatProgress(count) {
        if (!count || typeof count !== 'object') return count || 0
        if (count.total === 0) return ''
        if (count.done === 0) return count.total
        return `${count.done}/${count.total}`
      },
      getProjectCount(projectId) {
        return this.projectCounts[projectId] || { done: 0, total: 0 }
      },
      getStatusCount(statusId) {
        return this.statusCounts[statusId] || 0
      }
    }
  }
</script>

<style scoped>
  .sidebar {
    width: 240px;
    background: #000;
    border-right: 1px solid var(--border-color, #3a3f4b);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .sidebar-header {
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    user-select: none;
  }

  .sidebar-header.collapsible {
    cursor: pointer;
    transition: background 0.15s;
  }

  .sidebar-header.collapsible:hover {
    background: var(--bg-hover, #1a1a1a);
  }

  .sidebar-header h2 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-secondary, #a0a0a0);
  }

  .collapse-indicator {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary, #a0a0a0);
    width: 14px;
    text-align: center;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    cursor: pointer;
    color: var(--text-primary, #e0e0e0);
    transition: background 0.2s;
  }

  .nav-item:hover {
    background: var(--bg-hover, #2a2f3d);
  }

  .nav-item.active {
    background: var(--accent-color, #0f4c75);
  }

  .nav-icon {
    width: 16px;
    text-align: center;
    color: var(--text-secondary, #a0a0a0);
  }

  .count {
    margin-left: auto;
    font-size: 12px;
    color: var(--text-secondary, #a0a0a0);
  }

  .nav-divider {
    height: 1px;
    background: var(--border-color, #3a3f4b);
    margin: 8px 16px;
  }

  .add-project,
  .add-status {
    padding: 8px 16px;
  }

  .add-project input,
  .add-status input {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--border-color, #3a3f4b);
    border-radius: 4px;
    background: var(--bg-primary, #1a1f2e);
    color: var(--text-primary, #e0e0e0);
    font-size: 13px;
    box-sizing: border-box;
  }

  .add-project button,
  .add-status button {
    width: 100%;
    padding: 6px 8px;
    background: transparent;
    border: 1px dashed var(--border-color, #3a3f4b);
    border-radius: 4px;
    color: var(--text-secondary, #a0a0a0);
    cursor: pointer;
    font-size: 13px;
  }

  .add-project button:hover,
  .add-status button:hover {
    border-color: var(--accent-color, #0f4c75);
    color: var(--accent-color, #0f4c75);
  }

  .project-dot,
  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* Draggable project/status items */
  .project-item,
  .status-item {
    cursor: grab;
  }

  .project-item:active,
  .status-item:active {
    cursor: grabbing;
  }

  .project-item.sortable-ghost,
  .status-item.sortable-ghost {
    opacity: 0.4;
    background: var(--accent-color, #0f4c75);
  }

  .project-item.sortable-drag,
  .status-item.sortable-drag {
    background: var(--bg-hover, #2a2f3d);
  }

  .project-name,
  .status-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .edit-btn {
    background: none;
    border: none;
    color: var(--text-secondary, #a0a0a0);
    cursor: pointer;
    padding: 2px 6px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .nav-item:hover .edit-btn {
    opacity: 1;
  }

  .settings-section,
  .sidebar-section {
    border-top: 1px solid var(--border-color, #333);
    margin-top: auto;
  }

  .status-header {
    border-top: 1px solid var(--border-color, #333);
  }

  .settings-content {
    padding: 8px 16px;
  }

  .preference-item {
    margin-bottom: 8px;
  }

  .timezone-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .preference-label {
    font-size: 12px;
    color: var(--text-secondary, #888);
  }

  .timezone-select {
    width: 100%;
    padding: 4px 8px;
    background: var(--bg-secondary, #1e2330);
    border: 1px solid var(--border-color, #3a3f4b);
    border-radius: 4px;
    color: var(--text-primary, #e0e0e0);
    font-size: 12px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-primary, #e0e0e0);
  }

  .settings-btn {
    width: 100%;
    padding: 6px 8px;
    margin-bottom: 8px;
    background: var(--bg-primary, #1a1f2e);
    border: 1px solid var(--border-color, #3a3f4b);
    border-radius: 4px;
    color: var(--text-primary, #e0e0e0);
    cursor: pointer;
    font-size: 13px;
  }

  .settings-btn:hover {
    background: var(--bg-hover, #2a2f3d);
  }

  .settings-btn.danger-btn {
    border-color: #d93025;
    color: #d93025;
  }

  .settings-btn.danger-btn:hover {
    background: #d93025;
    color: #fff;
  }

  .database-location,
  .app-version {
    font-size: 11px;
    color: var(--text-secondary, #a0a0a0);
    word-break: break-all;
  }

  .pin-btn {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--text-secondary, #a0a0a0);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background 0.2s,
      color 0.2s;
  }

  .pin-btn:hover {
    background: var(--bg-hover, #2a2f3d);
    color: var(--text-primary, #e0e0e0);
  }

  .pin-btn.pinned {
    color: var(--accent-color, #0f4c75);
  }

  /* Light theme styles */
  .sidebar.light-theme {
    background: #f5f5f5;
    border-right-color: #e0e0e0;
  }

  .sidebar.light-theme .sidebar-header h2 {
    color: #666;
  }

  .sidebar.light-theme .collapse-indicator {
    color: #666;
  }

  .sidebar.light-theme .nav-item {
    color: #333;
  }

  .sidebar.light-theme .nav-item:hover {
    background: #e8e8e8;
  }

  .sidebar.light-theme .nav-item.active {
    background: #d0e7f7;
  }

  .sidebar.light-theme .nav-icon {
    color: #666;
  }

  .sidebar.light-theme .count {
    color: #888;
  }

  .sidebar.light-theme .nav-divider {
    background: #ddd;
  }

  .sidebar.light-theme .add-project input,
  .sidebar.light-theme .add-status input {
    border-color: #ddd;
    background: #fff;
    color: #333;
  }

  .sidebar.light-theme .add-project button,
  .sidebar.light-theme .add-status button {
    border-color: #ccc;
    color: #666;
  }

  .sidebar.light-theme .add-project button:hover,
  .sidebar.light-theme .add-status button:hover {
    border-color: #3498db;
    color: #3498db;
  }

  .sidebar.light-theme .edit-btn {
    color: #888;
  }

  .sidebar.light-theme .settings-section,
  .sidebar.light-theme .sidebar-section {
    border-top-color: #ddd;
  }

  .sidebar.light-theme .status-header {
    border-top-color: #ddd;
  }

  .sidebar.light-theme .preference-label {
    color: #666;
  }

  .sidebar.light-theme .timezone-select {
    background: #fff;
    border-color: #ddd;
    color: #333;
  }

  .sidebar.light-theme .checkbox-label {
    color: #333;
  }

  .sidebar.light-theme .settings-btn {
    background: #fff;
    border-color: #ddd;
    color: #333;
  }

  .sidebar.light-theme .settings-btn:hover {
    background: #e8e8e8;
  }

  .sidebar.light-theme .database-location,
  .sidebar.light-theme .app-version {
    color: #888;
  }

  .sidebar.light-theme .pin-btn {
    color: #888;
  }

  .sidebar.light-theme .pin-btn:hover {
    background: #e8e8e8;
    color: #333;
  }

  .sidebar.light-theme .project-item.sortable-ghost,
  .sidebar.light-theme .status-item.sortable-ghost {
    background: #d0e7f7;
  }

  .sidebar.light-theme .project-item.sortable-drag,
  .sidebar.light-theme .status-item.sortable-drag {
    background: #e8e8e8;
  }
</style>

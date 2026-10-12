<template>
  <div
    class="app"
    :class="{ 'light-theme': theme === 'light', 'sidebar-collapsed': !sidebarVisible }"
    :style="{ borderLeftColor: currentProjectColor }"
  >
    <div
      v-if="!sidebarVisible"
      class="sidebar-hover-trigger"
      @mouseenter="sidebarVisible = true"
    ></div>
    <div v-if="dbError" class="db-error-banner" role="alert">
      <span>{{ dbError }}</span>
      <button class="db-error-dismiss" @click="dbError = ''">&times;</button>
    </div>
    <AppSidebar
      :pinned="sidebarPinned"
      :theme="theme"
      :on-mouse-leave="onSidebarMouseLeave"
      :on-mouse-enter="() => (sidebarVisible = true)"
      :current-filter="currentFilter"
      :projects="projects"
      :statuses="statuses"
      :all-count="allCount"
      :trash-count="trashCount"
      :archive-count="archiveCount"
      :project-counts="projectCounts"
      :status-counts="statusCounts"
      :timezone="timezone"
      :database-path="databasePath"
      :app-version="appVersion"
      @toggle-pin="toggleSidebarPin"
      @set-filter="setFilter"
      @update:projects="projects = $event"
      @projects-reorder="onProjectDragEnd"
      @add-project="addProjectFromSidebar"
      @edit-project="editProject"
      @update:statuses="statuses = $event"
      @statuses-reorder="onStatusDragEnd"
      @add-status="addStatusFromSidebar"
      @edit-status="editStatus"
      @update:timezone="onTimezoneChange"
      @export="handleExport"
      @show-import="showImportDialog = true"
      @show-reset-database="showResetDialog = true"
    />

    <ImportDialog
      v-if="showImportDialog"
      @close="showImportDialog = false"
      @import="handleImport"
    />

    <ResetDatabaseModal
      v-if="showResetDialog"
      :result="resetResult"
      @close="closeResetDialog"
      @confirm="handleResetDatabase"
    />

    <HelpModal v-if="showHelpModal" @close="showHelpModal = false" />

    <CardFullscreen
      v-if="fullscreenTodo"
      :todo="fullscreenTodo"
      @close="fullscreenTodoId = null"
      @update-title="handleUpdateTitle(fullscreenTodo, $event)"
      @update-notes="handleUpdateNotes(fullscreenTodo, $event)"
    />

    <!-- Modals -->
    <StatusModal
      :status="editingStatus"
      :colors="statusColors"
      @save="saveStatusFromModal"
      @cancel="cancelEditStatus"
      @delete="deleteStatusConfirm"
    />

    <ProjectModal
      :project="editingProject"
      :colors="projectColors"
      :project-tags="editingProjectTags"
      :all-tags="allTags"
      @save="saveProjectFromModal"
      @cancel="cancelEditProject"
      @delete="deleteProjectConfirm"
      @add-tag="addProjectTag"
      @remove-tag="removeProjectTag"
    />

    <div class="main-wrapper">
      <main class="main-content">
        <AppHeader
          ref="appHeader"
          v-model:search-query="searchQuery"
          v-model:sort-by="sortBy"
          v-model:show-completed="showCompleted"
          v-model:group-by-project="groupByProject"
          v-model:new-todo-title="newTodoTitle"
          :current-filter="currentFilter"
          :is-project-selected="isProjectSelected"
          :current-project-name="currentProjectName"
          :show-projects-overview="showProjectsOverview"
          :completed-count="completedCount"
          :show-global-search="showGlobalSearch"
          :show-help-modal="showHelpModal"
          :history-state="historyState"
          :theme="theme"
          :current-view="currentView"
          :available-views="availableViews"
          :is-trash-view="isTrashView"
          :trash-count="trashCount"
          :card-layout="cardLayout"
          :card-width="cardWidth"
          @go-home="setFilter('inbox')"
          @archive-completed="archiveCompletedTodos"
          @open-search="showGlobalSearch = true"
          @undo="undo"
          @redo="redo"
          @open-help="showHelpModal = true"
          @toggle-theme="toggleTheme"
          @set-view="setView"
          @set-card-layout="cardLayout = $event"
          @set-card-width="cardWidth = $event"
          @empty-trash="emptyTrash"
          @add-todo="addTodo"
        />

        <!-- Home Landing Page / Inbox View -->
        <HomeLanding
          v-if="showProjectsOverview || currentFilter === 'inbox'"
          :projects="projects"
          :project-counts="projectCounts"
          :inbox-todos="inboxTodos"
          @select-project="selectProjectFromOverview"
          @drop-todo-on-project="moveInboxTodoToProject"
          @toggle-complete="toggleComplete"
          @delete-todo="deleteTodo"
          @update-title="handleUpdateTitle"
          @update-notes="handleUpdateNotes"
          @archive-todo="archiveTodo"
          @move-to-project="moveToProject"
          @set-due-date="setDueDate"
        />

        <!-- Project fade transition -->
        <Transition v-else-if="currentFilter !== 'inbox'" name="fade" mode="out-in">
          <div :key="currentFilter" class="project-content">
            <!-- Project Notes: the pane header is the open/close control. -->
            <div
              v-if="isProjectSelected"
              class="project-notes-pane"
              :class="{ collapsed: !showProjectNotes }"
              :style="showProjectNotes ? { width: projectNotesWidth + 'px' } : {}"
            >
              <div class="project-notes-header">
                <button
                  class="project-notes-toggle"
                  :title="showProjectNotes ? 'Hide project notes' : 'Show project notes'"
                  @click="toggleProjectNotes"
                >
                  <span class="project-notes-caret">{{ showProjectNotes ? '▾' : '▸' }}</span>
                  <span class="project-notes-title">Project Notes</span>
                </button>
                <div v-if="showProjectNotes" class="project-notes-modes">
                  <button
                    :class="{ active: !projectNotesPreview }"
                    @click="projectNotesPreview = false"
                  >
                    Edit
                  </button>
                  <button
                    :class="{ active: projectNotesPreview }"
                    @click="projectNotesPreview = true"
                  >
                    View
                  </button>
                </div>
              </div>
              <div v-if="showProjectNotes" class="project-notes-body">
                <div
                  v-if="projectNotesPreview"
                  class="project-notes-preview markdown-body"
                  title="Click to edit"
                  @click="projectNotesPreview = false"
                  v-html="renderedProjectNotes"
                ></div>
                <NotesEditor
                  v-else
                  ref="projectNotesEditor"
                  autofocus
                  :model-value="projectNotesDraft"
                  @update:model-value="onProjectNotesInput"
                  @blur="onProjectNotesBlur"
                />
              </div>
            </div>
            <div
              v-if="isProjectSelected && showProjectNotes"
              class="project-notes-resizer"
              title="Drag to resize"
              @mousedown="startNotesResize"
            ></div>
            <!-- Views Container -->
            <div class="views-container">
              <!-- Cards View -->
              <CardsView
                v-if="currentView === 'cards'"
                :theme="theme"
                :sorted-todos="sortedTodos"
                :grouped-todos="groupedTodos"
                :group-by-project="groupByProject"
                :selected-todo-id="null"
                :selected-todo-ids="selectedTodoIds"
                :focused-todo-id="focusedTodo?.id"
                :is-trash-view="isTrashView"
                :is-archive-view="isArchiveView"
                :card-columns="cardColumns"
                :card-min-width="cardMinWidth"
                :sort-by="sortBy"
                :current-filter="currentFilter"
                :projects="projects"
                @card-click="handleCardClick"
                @toggle-complete="toggleComplete"
                @delete-todo="deleteTodo"
                @restore-todo="restoreTodo"
                @permanent-delete-todo="permanentlyDeleteTodo"
                @unarchive-todo="unarchiveTodo"
                @update-sorted-todos="updateSortedTodos"
                @update-group-todos="updateGroupTodos"
                @add-todo-to-project="addTodoToProject"
                @marquee-select="handleMarqueeSelect"
                @update-title="handleUpdateTitle"
                @update-notes="handleUpdateNotes"
                @archive-todo="archiveTodo"
                @move-to-project="moveToProject"
                @set-due-date="setDueDate"
                @open-fullscreen="fullscreenTodoId = $event.id"
                @clear-selection="clearSelection"
              />

              <!-- Kanban View -->
              <KanbanView
                v-else-if="currentView === 'kanban'"
                key="kanban"
                :group-by-project="groupByProject && currentFilter === null"
                :is-project-selected="isProjectSelected"
                :grouped-todos="groupedTodos"
                :statuses="statuses"
                :show-completed="showCompleted"
                :no-status-todos="noStatusTodos"
                :selected-todo-id="null"
                :selected-todo-ids="selectedTodoIds"
                :all-todos="sortedKanbanTodos"
                @card-click="handleCardClick"
                @toggle-complete="toggleComplete"
                @delete-todo="deleteTodo"
                @add-todo-to-status="addTodoToStatus"
                @update-status-todos="updateStatusTodos"
                @kanban-drop-status="onKanbanDropStatus"
                @stacked-kanban-drop="onStackedKanbanDrop"
                @update-title="handleUpdateTitle"
                @update-notes="handleUpdateNotes"
                @archive-todo="archiveTodo"
                @set-due-date="setDueDate"
                @open-fullscreen="fullscreenTodoId = $event.id"
                @clear-selection="clearSelection"
              />

              <div
                v-if="filteredTodos.length === 0 && currentView !== 'kanban'"
                class="empty-state"
              >
                <p>No items yet. Add one above.</p>
              </div>
            </div>
          </div>
        </Transition>
      </main>
    </div>

    <!-- Global Search -->
    <GlobalSearch
      :visible="showGlobalSearch"
      :recent-items="recentItems"
      @close="showGlobalSearch = false"
      @select-todo="onGlobalSearchSelectTodo"
      @select-project="onGlobalSearchSelectProject"
    />
  </div>
</template>

<script>
  import GlobalSearch from './components/GlobalSearch.vue'
  import NotesEditor from './components/NotesEditor.vue'
  import {
    AppHeader,
    AppSidebar,
    CardFullscreen,
    CardsView,
    HelpModal,
    HomeLanding,
    ImportDialog,
    KanbanView,
    StatusModal,
    ProjectModal,
    ResetDatabaseModal
  } from './components/index.js'

  import { useTodos } from './composables/useTodos.js'
  import { useProjects } from './composables/useProjects.js'
  import { useStatuses } from './composables/useStatuses.js'
  import { useMasonry } from './composables/useMasonry.js'
  import keyboardShortcutsMixin from './mixins/keyboardShortcutsMixin.js'
  import todoActionsMixin from './mixins/todoActionsMixin.js'
  import { validateLocalStorage } from './utils/localStorageValidation.js'
  import { cardMinWidth, normalizeCardWidth } from './utils/cardWidth.js'
  import { isWindowUnfocused } from './utils/windowFocus.js'
  import { renderMarkdown } from './utils/markdown.js'
  import {
    initializeMermaid,
    reinitializeMermaid,
    renderPendingMermaidDiagrams,
    resetProcessedMermaidDiagrams
  } from './utils/mermaid.js'

  // Run localStorage validation before anything else reads settings
  validateLocalStorage()
  initializeMermaid(localStorage.getItem('todo-theme') || 'dark')

  export default {
    name: 'App',
    components: {
      AppHeader,
      AppSidebar,
      CardFullscreen,
      CardsView,
      GlobalSearch,
      HelpModal,
      HomeLanding,
      ImportDialog,
      KanbanView,
      NotesEditor,
      StatusModal,
      ProjectModal,
      ResetDatabaseModal
    },
    mixins: [keyboardShortcutsMixin, todoActionsMixin],
    setup() {
      const todosComposable = useTodos()
      const projectsComposable = useProjects()
      const statusesComposable = useStatuses()
      const { applyMasonryLayout, startCardResizeObserver, stopCardResizeObserver } = useMasonry()

      return {
        todosComposable,
        projectsComposable,
        statusesComposable,
        applyMasonryLayout,
        startCardResizeObserver,
        stopCardResizeObserver
      }
    },
    data() {
      return {
        // todos, allTodos, selectedTodoIds, focusedTodoIndex now from todosComposable
        // projects, editingProject, editingProjectTags now from projectsComposable
        // statuses, editingStatus now from statusesComposable
        currentFilter: null,
        tabViews: JSON.parse(localStorage.getItem('tab-views') || '{}'),
        activeTab: (() => {
          const saved = localStorage.getItem('active-tab')
          if (saved === 'todos' || saved === 'notes' || saved === 'split') return 'items'
          return saved || 'items'
        })(),
        showCompleted: localStorage.getItem('show-completed') === 'true',
        newTodoTitle: '',
        allTags: [],
        // sortBy and searchQuery are still here because they're used by the component's UI state
        sortBy: localStorage.getItem('sort-by') || 'manual',
        searchQuery: '',
        groupByProject: localStorage.getItem('group-by-project') === 'true',
        showProjectNotes: localStorage.getItem('show-project-notes') === 'true',
        projectNotesDraft: '',
        projectNotesDraftId: null,
        projectNotesPreview: localStorage.getItem('project-notes-preview') !== 'false',
        projectNotesWidth: parseInt(localStorage.getItem('project-notes-width')) || 340,
        projectNotesSaveTimer: null,
        cardLayout: localStorage.getItem('card-layout') === 'row' ? 'row' : 'card',
        cardWidth: normalizeCardWidth(localStorage.getItem('card-width')),
        timezone: localStorage.getItem('timezone') || 'auto',
        // projectColors now from projectsComposable
        // statusColors now from statusesComposable
        // Theme
        theme: localStorage.getItem('todo-theme') || 'dark',
        // Sidebar visibility
        sidebarVisible: localStorage.getItem('sidebar-visible') !== 'false',
        sidebarPinned: localStorage.getItem('sidebar-pinned') === 'true',
        // Trash & Archive
        trashCount: 0,
        archiveCount: 0,
        // Global search
        showGlobalSearch: false,
        showProjectsOverview: false,
        recentItems: JSON.parse(localStorage.getItem('recent-items') || '[]'),
        // Export/Import
        showImportDialog: false,
        showResetDialog: false,
        resetResult: null,
        dbError: '',
        dbErrorTimeout: null,
        databasePath: '',
        appVersion: '',
        // History state
        historyState: {
          canUndo: false,
          canRedo: false,
          undoDescription: null,
          redoDescription: null
        },
        // Help modal
        showHelpModal: false,
        // Todo open in the full-screen overlay, null when closed
        fullscreenTodoId: null
      }
    },
    computed: {
      currentView: {
        get() {
          const view = this.tabViews[this.activeTab]
          if (view && this.availableViews.includes(view)) {
            return view
          }
          return this.availableViews[0] || 'cards'
        },
        set(val) {
          this.tabViews[this.activeTab] = val
          localStorage.setItem('tab-views', JSON.stringify(this.tabViews))
        }
      },
      // Delegate to composables
      projects() {
        return this.projectsComposable.projects.value
      },
      todos() {
        return this.todosComposable.todos.value
      },
      allTodos() {
        return this.todosComposable.allTodos.value
      },
      // Read from the live list, so the overlay follows edits and closes when
      // the todo is gone.
      fullscreenTodo() {
        return this.allTodos.find((t) => t.id === this.fullscreenTodoId) || null
      },
      statuses() {
        return this.statusesComposable.statuses.value
      },
      selectedTodoIds() {
        return this.todosComposable.selectedTodoIds.value
      },
      focusedTodoIndex: {
        get() {
          return this.todosComposable.focusedTodoIndex.value
        },
        set(value) {
          this.todosComposable.focusedTodoIndex.value = value
        }
      },
      editingProject() {
        return this.projectsComposable.editingProject.value
      },
      editingProjectTags() {
        return this.projectsComposable.editingProjectTags.value
      },
      editingStatus() {
        return this.statusesComposable.editingStatus.value
      },
      projectColors() {
        return this.projectsComposable.projectColors
      },
      statusColors() {
        return this.statusesComposable.statusColors
      },
      currentProjectColor() {
        if (
          this.currentFilter &&
          this.currentFilter !== 'inbox' &&
          this.currentFilter !== 'trash'
        ) {
          const project = this.projects.find((p) => p.id === this.currentFilter)
          return project ? project.color : '#333'
        }
        return '#333'
      },
      isProjectSelected() {
        return typeof this.currentFilter === 'number'
      },
      currentProjectName() {
        if (!this.isProjectSelected) return ''
        const project = this.projects.find((p) => p.id === this.currentFilter)
        return project ? project.name : ''
      },
      selectedProject() {
        if (!this.isProjectSelected) return null
        return this.projects.find((p) => p.id === this.currentFilter) || null
      },
      isTrashView() {
        return this.currentFilter === 'trash'
      },
      isArchiveView() {
        return this.currentFilter === 'archive'
      },
      allCount() {
        const total = this.allTodos.length
        const done = this.allTodos.filter((t) => t.completed).length
        return { done, total }
      },
      inboxCount() {
        const inbox = this.allTodos.filter((t) => !t.project_id)
        const total = inbox.length
        const done = inbox.filter((t) => t.completed).length
        return { done, total }
      },
      projectCounts() {
        return this.projectsComposable.projectCounts.value
      },
      statusCounts() {
        return this.statusesComposable.getStatusCounts(this.allTodos)
      },
      availableViews() {
        return ['cards', 'kanban']
      },
      inboxTodos() {
        return this.filteredTodos.filter((t) => !t.project_id)
      },
      noStatusTodos() {
        return this.filteredTodos.filter((t) => !t.status_id)
      },
      focusedTodo() {
        if (this.focusedTodoIndex >= 0 && this.focusedTodoIndex < this.todos.length) {
          return this.todos[this.focusedTodoIndex]
        }
        return null
      },
      sortedTodos() {
        this.todosComposable.setSortBy(this.sortBy)
        // The composable's sortedTodos uses filteredTodos as base, which we've already set up above
        return this.todosComposable.sortedTodos.value
      },
      groupedTodos() {
        const groups = []
        const sorted = this.sortedTodos

        // Inbox group (todos without project)
        const inboxTodos = sorted.filter((t) => !t.project_id)
        if (inboxTodos.length > 0) {
          groups.push({
            id: 'inbox',
            name: 'Inbox',
            color: '#666',
            todos: inboxTodos
          })
        }

        // Project groups
        for (const project of this.projects) {
          const projectTodos = sorted.filter((t) => t.project_id === project.id)
          if (projectTodos.length > 0) {
            groups.push({
              id: project.id,
              name: project.name,
              color: project.color,
              todos: projectTodos
            })
          }
        }

        return groups
      },
      filteredTodos() {
        // Set filter state in composable for its internal computed properties
        this.todosComposable.setCurrentFilter(this.currentFilter)
        this.todosComposable.setSearchQuery(this.searchQuery)
        this.todosComposable.setShowCompleted(this.showCompleted)

        return this.todosComposable.filteredTodos.value
      },
      sortedKanbanTodos() {
        // Kanban columns must honour the sort dropdown just like the cards view.
        return this.todosComposable.sortTodos(this.filteredTodos, this.sortBy)
      },
      completedCount() {
        return this.todosComposable.completedCount.value
      },
      // Card layout has two modes: 'row' shows full-width list rows (one
      // column), 'card' shows a fixed multi-column grid. Both drive the same
      // --card-columns grid variable the cards view already uses.
      cardColumns() {
        return this.cardLayout === 'row' ? 1 : 3
      },
      // Minimum width of a card in the card-mode auto-fill grid.
      cardMinWidth() {
        return cardMinWidth(this.cardWidth)
      },
      renderedProjectNotes() {
        return renderMarkdown(this.projectNotesDraft)
      }
    },
    watch: {
      currentView(val) {
        // Handle entering new view
        if (val === 'cards') {
          this.$nextTick(() => {
            this.applyMasonryLayout()
          })
        }
      },
      currentFilter() {
        // Flush any pending notes save for the project we are leaving, then load
        // the newly selected project's notes into the editor draft.
        this.flushProjectNotes()
        this.loadProjectNotesDraft()
      },
      showProjectNotes(val) {
        localStorage.setItem('show-project-notes', val)
      },
      projectNotesPreview(val) {
        localStorage.setItem('project-notes-preview', val)
      },
      // Keep the light-theme class on <body> too, not just .app. Several dark
      // rules are written as `body:not(.light-theme) …` with !important; without
      // the class on body they leak into light mode and override text colors.
      theme: {
        immediate: true,
        handler(val) {
          document.body.classList.toggle('light-theme', val === 'light')
        }
      },
      sortedTodos() {
        if (this.currentView === 'cards') {
          this.applyMasonryLayout()
        }
      },
      groupedTodos() {
        if (this.currentView === 'cards') {
          this.applyMasonryLayout()
        }
      },
      sidebarVisible(val) {
        localStorage.setItem('sidebar-visible', val)
      },
      cardLayout(val) {
        localStorage.setItem('card-layout', val)
      },
      cardWidth(val) {
        localStorage.setItem('card-width', val)
      },
      isProjectSelected(val) {
        if (val && this.groupByProject) {
          this.groupByProject = false
        }
      },
      groupByProject(val) {
        localStorage.setItem('group-by-project', val)
      },
      showCompleted(val) {
        localStorage.setItem('show-completed', val)
      },
      sortBy(val) {
        localStorage.setItem('sort-by', val)
      }
    },
    async mounted() {
      await this.loadData()

      // Restore last used filter from localStorage
      const savedFilter = localStorage.getItem('current-filter')
      if (savedFilter) {
        try {
          const filter = JSON.parse(savedFilter)
          // Verify the filter is valid (project still exists if it's a number)
          let restored = null
          if (filter === 'inbox' || filter === 'trash') {
            restored = filter
          } else if (typeof filter === 'number' && this.projects.some((p) => p.id === filter)) {
            restored = filter
          }
          if (restored !== null && restored !== this.currentFilter) {
            this.currentFilter = restored
            await this.loadTodos()
          }
        } catch {
          // Failed to restore filter, will use default
        }
      }
      this.databasePath = await window.api.getDatabasePath()
      this.appVersion = await window.api.getAppVersion()

      window.api.onRefreshTodos(() => {
        this.loadAllTodos()
        this.loadTodos()
        // Reapply masonry layout when todos are refreshed (e.g., after editing notes)
        if (this.currentView === 'cards') {
          this.applyMasonryLayout()
        }
      })

      // Keyboard shortcuts
      window.addEventListener('keydown', this.handleKeyDown)
      window.addEventListener('focus', this.onWindowFocus)

      // Listen for history state changes (undo/redo)
      this.historyState = await window.api.getHistoryState()
      window.api.onHistoryChanged((state) => {
        this.historyState = state
      })

      // Add native event listener for links in markdown
      document.addEventListener('click', (event) => {
        const link = event.target.closest('a')
        if (
          link &&
          link.href &&
          (link.closest('.notes-preview') || link.closest('.card-notes-preview'))
        ) {
          event.preventDefault()
          event.stopPropagation()
          if (window.api && window.api.openExternal) {
            window.api.openExternal(link.href)
          }
        }
      })

      // Reapply the masonry layout when card sizes change
      this.startCardResizeObserver(() => {
        if (this.currentView === 'cards') {
          this.applyMasonryLayout()
        }
      })
    },
    beforeUnmount() {
      window.removeEventListener('keydown', this.handleKeyDown)
      window.removeEventListener('focus', this.onWindowFocus)
      this.stopCardResizeObserver()
    },
    methods: {
      onTimezoneChange(value) {
        this.timezone = value
        localStorage.setItem('timezone', value)
      },
      // Full reload of everything the UI shows; used on startup and after imports
      async loadData() {
        await this.loadProjects()
        await this.loadStatuses()
        await this.loadAllTags()
        await this.loadAllTodos()
        await this.loadTodos()
      },
      async loadProjects() {
        await this.projectsComposable.loadProjects()
        // Sync allTodos to projects composable for projectCounts
        this.projectsComposable.setAllTodos(this.allTodos)
      },
      async loadStatuses() {
        await this.statusesComposable.loadStatuses()
      },
      async loadAllTodos() {
        await this.todosComposable.loadAllTodos()
        // Always show global counts since archive/trash views show all items
        this.trashCount = await window.api.getTrashCount()
        this.archiveCount = await window.api.getArchiveCount()
        // Sync allTodos to projects composable for projectCounts
        this.projectsComposable.setAllTodos(this.allTodos)
      },
      async loadTodos() {
        await this.todosComposable.loadTodos(this.currentFilter)
      },
      loadProjectNotesDraft() {
        this.projectNotesDraft = this.selectedProject ? this.selectedProject.notes || '' : ''
        this.projectNotesDraftId = this.isProjectSelected ? this.currentFilter : null
      },
      toggleProjectNotes() {
        if (this.showProjectNotes) {
          // Closing: persist any pending edit before the editor unmounts.
          this.flushProjectNotes()
        }
        this.showProjectNotes = !this.showProjectNotes
        if (this.showProjectNotes) {
          this.loadProjectNotesDraft()
        }
      },
      onProjectNotesInput(value) {
        // Debounce persistence so we are not writing on every keystroke.
        this.projectNotesDraft = value
        if (this.projectNotesSaveTimer) clearTimeout(this.projectNotesSaveTimer)
        this.projectNotesSaveTimer = setTimeout(() => this.saveProjectNotes(), 500)
      },
      onProjectNotesBlur() {
        // Switching to another application must not close the editor behind
        // the user's back (see docs/editing.md).
        if (isWindowUnfocused()) return
        // Save, then return to the preview (the resting state).
        this.flushProjectNotes()
        this.projectNotesPreview = true
      },
      onWindowFocus() {
        // Put the caret back into the project notes editor the user left open.
        if (this.showProjectNotes && !this.projectNotesPreview) {
          this.$nextTick(() => this.$refs.projectNotesEditor?.focus())
        }
      },
      startNotesResize(event) {
        event.preventDefault()
        const startX = event.clientX
        const startWidth = this.projectNotesWidth
        const onMove = (moveEvent) => {
          const next = startWidth + (moveEvent.clientX - startX)
          this.projectNotesWidth = Math.min(700, Math.max(220, next))
        }
        const onUp = () => {
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
          localStorage.setItem('project-notes-width', this.projectNotesWidth)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
      },
      async saveProjectNotes() {
        if (this.projectNotesSaveTimer) {
          clearTimeout(this.projectNotesSaveTimer)
          this.projectNotesSaveTimer = null
        }
        // Save against the project the draft belongs to, not the current filter,
        // so a project switch mid-edit cannot write the draft to the wrong project.
        if (this.projectNotesDraftId === null) return
        await this.projectsComposable.updateProjectNotes(
          this.projectNotesDraftId,
          this.projectNotesDraft
        )
      },
      flushProjectNotes() {
        // Persist immediately without waiting for the debounce (e.g. on blur or
        // when switching away from the project).
        if (this.projectNotesSaveTimer) {
          this.saveProjectNotes()
        }
      },
      async setFilter(filter) {
        this.currentFilter = filter
        this.showProjectsOverview = false
        // Save current filter to localStorage
        if (filter === null) {
          localStorage.removeItem('current-filter')
        } else {
          localStorage.setItem('current-filter', JSON.stringify(filter))
        }
        await this.loadTodos()
        // Refresh archive/trash counts (always global)
        this.trashCount = await window.api.getTrashCount()
        this.archiveCount = await window.api.getArchiveCount()
      },
      async onProjectDragEnd() {
        await this.projectsComposable.onProjectDragEnd()
      },
      async onStatusDragEnd() {
        await this.statusesComposable.onStatusDragEnd()
      },
      handleCardClick(event, id) {
        // Check if the click was on a link
        const link = event.target.closest('a')
        if (link && link.href) {
          event.preventDefault()
          event.stopPropagation()
          if (window.api && window.api.openExternal) {
            window.api.openExternal(link.href)
          }
          return
        }

        // Multi-select with Ctrl/Cmd+click
        if (event.ctrlKey || event.metaKey) {
          if (this.selectedTodoIds.has(id)) {
            this.selectedTodoIds.delete(id)
          } else {
            this.selectedTodoIds.add(id)
          }
          // Trigger reactivity
          this.selectedTodoIds = new Set(this.selectedTodoIds)
          return
        }

        // Normal click - clear multi-select and select single
        this.selectedTodoIds.clear()
        this.selectedTodoIds = new Set()
        this.selectTodo(id)
      },
      handleMarqueeSelect(ids) {
        // Set the selected IDs from marquee selection
        this.selectedTodoIds = new Set(ids)
      },
      selectTodo(id) {
        const index = this.todos.findIndex((t) => t.id === id)
        if (index >= 0) {
          this.focusedTodoIndex = index
        }
        const todo = this.allTodos.find((t) => t.id === id)
        if (todo) {
          this.addToRecentItems(todo)
        }
        this.$nextTick(() => {
          document.querySelector(`[data-todo-id="${id}"]`)?.scrollIntoView({ block: 'nearest' })
        })
      },
      async loadAllTags() {
        this.allTags = await window.api.getAllTags()
      },
      async addProjectFromSidebar(name) {
        await this.projectsComposable.addProject(name)
        this.projectsComposable.setAllTodos(this.allTodos)
      },
      async editProject(project) {
        await this.projectsComposable.editProject(project)
      },
      cancelEditProject() {
        this.projectsComposable.cancelEditProject()
      },
      async addProjectTag(tagName) {
        await this.projectsComposable.addProjectTag(tagName, this.loadAllTags.bind(this))
      },
      async removeProjectTag(tagId) {
        await this.projectsComposable.removeProjectTag(tagId)
      },
      async saveProject() {
        await this.projectsComposable.saveProject(
          this.loadAllTodos.bind(this),
          this.loadTodos.bind(this)
        )
      },
      async saveProjectFromModal(projectData) {
        this.projectsComposable.editingProject.value = projectData
        await this.saveProject()
      },
      async deleteProjectConfirm() {
        await this.projectsComposable.deleteProjectConfirm(
          this.currentFilter,
          (filter) => {
            this.currentFilter = filter
          },
          this.loadAllTodos.bind(this),
          this.loadTodos.bind(this)
        )
      },
      // Status methods
      async addStatusFromSidebar(name) {
        await this.statusesComposable.addStatus(name)
      },
      editStatus(status) {
        this.statusesComposable.editStatus(status)
      },
      cancelEditStatus() {
        this.statusesComposable.cancelEditStatus()
      },
      async saveStatus() {
        await this.statusesComposable.saveStatus(async () => {
          await this.loadAllTodos()
          await this.loadTodos()
        })
      },
      async saveStatusFromModal(statusData) {
        this.statusesComposable.editingStatus.value = statusData
        await this.saveStatus()
      },
      async deleteStatusConfirm() {
        await this.statusesComposable.deleteStatusConfirm(async () => {
          await this.loadAllTodos()
          await this.loadTodos()
        })
      },
      setTab(tab) {
        this.activeTab = tab
        localStorage.setItem('active-tab', tab)
        // currentView computed property will automatically get the saved view for this tab
      },
      setView(view) {
        this.currentView = view
        // Saved automatically by the computed setter
      },
      async onGlobalSearchSelectTodo(todoId) {
        // Find the todo to get its project and type
        const todo = this.allTodos.find((t) => t.id === todoId)
        if (todo) {
          // Switch to items tab
          this.setTab('items')
          // Navigate to correct project
          if (todo.project_id) {
            await this.setFilter(todo.project_id)
          } else {
            await this.setFilter('inbox')
          }
          this.$nextTick(() => {
            const index = this.todos.findIndex((t) => t.id === todoId)
            if (index >= 0) {
              this.focusedTodoIndex = index
            }
            this.selectTodo(todoId)
          })
        } else {
          // Fallback: just try to select the todo
          this.selectTodo(todoId)
        }
      },
      async onGlobalSearchSelectProject(project) {
        // Switch to items tab and navigate to project
        this.setTab('items')
        await this.setFilter(project.id)
      },
      addToRecentItems(todo) {
        if (!todo) return
        // Remove if already exists
        this.recentItems = this.recentItems.filter((t) => t.id !== todo.id)
        // Add to front
        this.recentItems.unshift({
          id: todo.id,
          title: todo.title,
          project_name: todo.project_name,
          project_id: todo.project_id,
          type: todo.type
        })
        // Keep only last 10
        this.recentItems = this.recentItems.slice(0, 10)
        // Persist
        localStorage.setItem('recent-items', JSON.stringify(this.recentItems))
      },
      async selectProjectFromOverview(projectId) {
        this.showProjectsOverview = false
        if (projectId === 'inbox') {
          await this.setFilter('inbox')
        } else {
          await this.setFilter(projectId)
        }
      },
      toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark'
        localStorage.setItem('todo-theme', this.theme)
        reinitializeMermaid(this.theme)
        // Clear processed mermaid diagrams to force re-render
        resetProcessedMermaidDiagrams()
        this.renderMermaid()
      },
      toggleSidebarPin() {
        this.sidebarPinned = !this.sidebarPinned
        localStorage.setItem('sidebar-pinned', this.sidebarPinned)
        if (this.sidebarPinned) {
          this.sidebarVisible = true
        }
      },
      onSidebarMouseLeave() {
        if (!this.sidebarPinned) {
          this.sidebarVisible = false
        }
      },
      async undo() {
        if (!this.historyState.canUndo) return
        await window.api.undo()
        await this.loadTodos()
        await this.loadAllTodos()
      },
      async redo() {
        if (!this.historyState.canRedo) return
        await window.api.redo()
        await this.loadTodos()
        await this.loadAllTodos()
      },
      async handleExport() {
        try {
          const result = await window.api.exportData()
          if (result.success) {
            alert('Backup exported successfully!')
          }
        } catch (error) {
          alert('Failed to export backup: ' + error.message)
        }
      },
      async handleImport(mode) {
        try {
          this.showImportDialog = false
          const result = await window.api.importData(mode)
          if (result.success) {
            alert('Backup imported successfully! Reloading data...')
            await this.loadData()
          } else if (result.error) {
            alert('Failed to import backup: ' + result.error)
          }
        } catch (error) {
          alert('Failed to import backup: ' + error.message)
        }
      },
      async handleResetDatabase() {
        try {
          this.resetResult = await window.api.resetDatabase()
        } catch (error) {
          this.resetResult = { success: false, error: error.message }
        }
      },
      async closeResetDialog() {
        const wasReset = this.resetResult?.success
        this.showResetDialog = false
        this.resetResult = null
        if (wasReset) {
          await this.loadData()
        }
      },
      showDbError(message) {
        this.dbError = message
        clearTimeout(this.dbErrorTimeout)
        this.dbErrorTimeout = setTimeout(() => {
          this.dbError = ''
        }, 8000)
      },
      async renderMermaid() {
        await this.$nextTick()
        await renderPendingMermaidDiagrams()
      }
    }
  }
</script>

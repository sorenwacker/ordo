<template>
  <div
    class="kanban-view-wrapper"
    @mousedown="onCanvasMouseDown"
    @dragover="onDragOver"
    @dragend="onDragEnd"
    @dragleave="onDragEnd"
    @drop="onDragEnd"
  >
    <!-- Stacked Kanban Boards (when groupByProject is active) -->
    <template v-if="groupByProject && !isProjectSelected">
      <div class="kanban-stacked">
        <div v-for="group in groupedTodos" :key="group.id" class="kanban-project-section">
          <div class="kanban-project-header" :style="{ borderLeftColor: group.color }">
            <span class="project-dot" :style="{ background: group.color }"></span>
            <h3>{{ group.name }}</h3>
            <span class="project-count">{{ group.todos.length }}</span>
          </div>
          <div class="kanban-view">
            <div class="kanban-column" style="border-top-color: #666">
              <div class="column-header">
                <span class="column-dot" style="background: #666"></span>
                <h3>No Status</h3>
                <span class="column-count">{{ getProjectStatusTodos(group.id, null).length }}</span>
              </div>
              <draggable
                :model-value="getProjectStatusTodos(group.id, null)"
                item-key="id"
                class="kanban-cards"
                group="kanban"
                ghost-class="ghost"
                :data-project-id="dropZoneProjectId(group.id)"
                data-status-id=""
                @end="onStackedKanbanDrop"
              >
                <template #item="{ element }">
                  <KanbanCard
                    :todo="element"
                    :selected="selectedTodoId === element.id || selectedTodoIds.has(element.id)"
                    :border-color="group.color"
                    @select="$emit('card-click', $event, element.id)"
                    @toggle-complete="$emit('toggle-complete', element)"
                    @delete="$emit('delete-todo', element.id)"
                    @update-title="$emit('update-title', element, $event)"
                    @update-notes="$emit('update-notes', element, $event)"
                    @archive="$emit('archive-todo', element.id)"
                    @set-due-date="$emit('set-due-date', element, $event)"
                    @open-fullscreen="$emit('open-fullscreen', element)"
                  />
                </template>
              </draggable>
            </div>
            <div
              v-for="status in visibleStatuses"
              :key="status.id"
              class="kanban-column"
              :style="{ borderTopColor: status.color }"
            >
              <div class="column-header">
                <span class="column-dot" :style="{ background: status.color }"></span>
                <h3>{{ status.name }}</h3>
                <span class="column-count">{{
                  getProjectStatusTodos(group.id, status.id).length
                }}</span>
              </div>
              <draggable
                :model-value="getProjectStatusTodos(group.id, status.id)"
                item-key="id"
                class="kanban-cards"
                group="kanban"
                ghost-class="ghost"
                :data-project-id="dropZoneProjectId(group.id)"
                :data-status-id="status.id"
                @end="onStackedKanbanDrop"
              >
                <template #item="{ element }">
                  <KanbanCard
                    :todo="element"
                    :selected="selectedTodoId === element.id || selectedTodoIds.has(element.id)"
                    :border-color="group.color"
                    @select="$emit('card-click', $event, element.id)"
                    @toggle-complete="$emit('toggle-complete', element)"
                    @delete="$emit('delete-todo', element.id)"
                    @update-title="$emit('update-title', element, $event)"
                    @update-notes="$emit('update-notes', element, $event)"
                    @archive="$emit('archive-todo', element.id)"
                    @set-due-date="$emit('set-due-date', element, $event)"
                    @open-fullscreen="$emit('open-fullscreen', element)"
                  />
                </template>
              </draggable>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Status-based Kanban -->
    <div v-else ref="kanbanView" class="kanban-view">
      <div class="kanban-column no-status-column">
        <div class="column-header">
          <span class="column-dot" style="background: #666"></span>
          <h3>No Status</h3>
          <span class="column-count">{{ noStatusTodos.length }}</span>
        </div>
        <draggable
          :model-value="noStatusTodos"
          item-key="id"
          class="kanban-cards"
          group="kanban-status"
          ghost-class="ghost"
          data-status-id=""
          @update:model-value="$emit('update-status-todos', null, $event)"
          @end="onKanbanDropStatus"
        >
          <template #item="{ element }">
            <KanbanCard
              :todo="element"
              :selected="selectedTodoId === element.id || selectedTodoIds.has(element.id)"
              :border-color="element.project_color || '#333'"
              show-project
              @select="$emit('card-click', $event, element.id)"
              @toggle-complete="$emit('toggle-complete', element)"
              @delete="$emit('delete-todo', element.id)"
              @update-title="$emit('update-title', element, $event)"
              @update-notes="$emit('update-notes', element, $event)"
              @archive="$emit('archive-todo', element.id)"
              @set-due-date="$emit('set-due-date', element, $event)"
              @open-fullscreen="$emit('open-fullscreen', element)"
            />
          </template>
        </draggable>
        <button class="kanban-add-btn" @click="$emit('add-todo-to-status', null)">+ Add</button>
      </div>

      <div
        v-for="status in visibleStatuses"
        :key="status.id"
        class="kanban-column"
        :style="{ borderTopColor: status.color }"
      >
        <div class="column-header">
          <span class="column-dot" :style="{ background: status.color }"></span>
          <h3>{{ status.name }}</h3>
          <span class="column-count">{{ getStatusTodos(status.id).length }}</span>
        </div>
        <draggable
          :model-value="getStatusTodos(status.id)"
          item-key="id"
          class="kanban-cards"
          group="kanban-status"
          ghost-class="ghost"
          :data-status-id="status.id"
          @update:model-value="$emit('update-status-todos', status.id, $event)"
          @end="onKanbanDropStatus"
        >
          <template #item="{ element }">
            <KanbanCard
              :todo="element"
              :selected="selectedTodoId === element.id || selectedTodoIds.has(element.id)"
              :border-color="element.project_color || status.color"
              show-project
              @select="$emit('card-click', $event, element.id)"
              @toggle-complete="$emit('toggle-complete', element)"
              @delete="$emit('delete-todo', element.id)"
              @update-title="$emit('update-title', element, $event)"
              @update-notes="$emit('update-notes', element, $event)"
              @archive="$emit('archive-todo', element.id)"
              @set-due-date="$emit('set-due-date', element, $event)"
              @open-fullscreen="$emit('open-fullscreen', element)"
            />
          </template>
        </draggable>
        <button class="kanban-add-btn" @click="$emit('add-todo-to-status', status.id)">
          + Add
        </button>
      </div>
    </div>
  </div>
</template>

<script>
  import draggable from 'vuedraggable'
  import KanbanCard from './KanbanCard.vue'
  import { isCanvasMouseDown } from '../utils/canvas.js'
  import { findDoneStatus } from '../utils/doneStatus.js'

  export default {
    name: 'KanbanView',
    components: {
      draggable,
      KanbanCard
    },
    props: {
      isProjectSelected: {
        type: Boolean,
        default: false
      },
      groupByProject: {
        type: Boolean,
        default: false
      },
      groupedTodos: {
        type: Array,
        default: () => []
      },
      statuses: {
        type: Array,
        default: () => []
      },
      showCompleted: {
        type: Boolean,
        default: false
      },
      noStatusTodos: {
        type: Array,
        default: () => []
      },
      selectedTodoId: {
        type: Number,
        default: null
      },
      selectedTodoIds: {
        type: Set,
        default: () => new Set()
      },
      allTodos: {
        type: Array,
        default: () => []
      }
    },
    emits: [
      'card-click',
      'toggle-complete',
      'delete-todo',
      'add-todo-to-status',
      'update-status-todos',
      'kanban-drop-status',
      'stacked-kanban-drop',
      'update-title',
      'update-notes',
      'archive-todo',
      'set-due-date',
      'open-fullscreen',
      'clear-selection'
    ],
    data() {
      return {
        scrollDirection: 0,
        scrollAnimationId: null
      }
    },
    computed: {
      // Completed cards are filtered out upstream while "Show done" is off, so
      // the Done column could only ever be empty; both layouts leave it out.
      visibleStatuses() {
        if (this.showCompleted) return this.statuses
        const done = findDoneStatus(this.statuses)
        return done ? this.statuses.filter((status) => status.id !== done.id) : this.statuses
      }
    },
    methods: {
      getStatusTodos(statusId) {
        return this.allTodos.filter((t) => t.status_id === statusId && !t.deleted)
      },
      getProjectStatusTodos(projectId, statusId) {
        return this.allTodos.filter((t) => {
          // Handle inbox (no project) - group.id is 'inbox' but todos have project_id: null
          const projectMatch = projectId === 'inbox' ? !t.project_id : t.project_id === projectId
          const statusMatch = statusId === null ? !t.status_id : t.status_id === statusId
          return projectMatch && statusMatch && !t.deleted
        })
      },
      // The Inbox section holds todos with no project, so its drop zone carries
      // an empty id the drop handler reads back as null.
      dropZoneProjectId(groupId) {
        return groupId === 'inbox' ? '' : groupId
      },
      onKanbanDropStatus(event) {
        this.$emit('kanban-drop-status', event)
      },
      onStackedKanbanDrop(event) {
        this.$emit('stacked-kanban-drop', event)
      },
      onCanvasMouseDown(event) {
        if (isCanvasMouseDown(event)) this.$emit('clear-selection')
      },
      onDragOver(event) {
        const kanbanView = this.$refs.kanbanView
        if (!kanbanView) return

        const rect = kanbanView.getBoundingClientRect()
        const x = event.clientX
        const edgeSize = 100

        let newDirection = 0
        if (x < rect.left + edgeSize) {
          newDirection = -1
        } else if (x > rect.right - edgeSize) {
          newDirection = 1
        }

        if (newDirection !== this.scrollDirection) {
          this.scrollDirection = newDirection
          if (newDirection !== 0) {
            this.startAutoScroll()
          } else {
            this.stopAutoScroll()
          }
        }
      },
      startAutoScroll() {
        if (this.scrollAnimationId) return
        const scrollSpeed = 8
        const scroll = () => {
          const kanbanView = this.$refs.kanbanView
          if (kanbanView && this.scrollDirection !== 0) {
            kanbanView.scrollLeft += this.scrollDirection * scrollSpeed
            this.scrollAnimationId = requestAnimationFrame(scroll)
          }
        }
        this.scrollAnimationId = requestAnimationFrame(scroll)
      },
      stopAutoScroll() {
        if (this.scrollAnimationId) {
          cancelAnimationFrame(this.scrollAnimationId)
          this.scrollAnimationId = null
        }
        this.scrollDirection = 0
      },
      onDragEnd() {
        this.stopAutoScroll()
      }
    }
  }
</script>

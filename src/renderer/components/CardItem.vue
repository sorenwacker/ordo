<template>
  <div
    class="todo-card"
    :class="{ completed: todo.completed, selected: selected, 'keyboard-focused': focused }"
    :style="cardStyle"
    :data-todo-id="todo.id"
    :draggable="isDraggable ? 'true' : 'false'"
    @click="handleClick($event)"
    @dragstart="onDragStart"
    @contextmenu.prevent="showContextMenu($event)"
  >
    <!-- Context Menu (teleported to .app so list/grid overflow cannot clip it
         while still inheriting the app's theme variables) -->
    <Teleport to=".app">
      <div
        v-if="contextMenuVisible"
        ref="contextMenu"
        class="card-context-menu"
        :style="contextMenuStyle"
        @click.stop
      >
        <div class="context-menu-item" @click="archiveFromMenu">Archive</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-label">Due date:</div>
        <div class="context-menu-item" @click="setDueDateFromMenu(dueDatePreset(0))">Today</div>
        <div class="context-menu-item" @click="setDueDateFromMenu(dueDatePreset(1))">Tomorrow</div>
        <div class="context-menu-item" @click="setDueDateFromMenu(dueDatePreset(7))">Next week</div>
        <div class="context-menu-item context-menu-date" @click.stop="openDatePicker">
          <span>Pick a date…</span>
          <input
            ref="dateInput"
            type="date"
            :value="dueDateValue"
            @click.stop
            @change="setDueDateFromMenu($event.target.value)"
          />
        </div>
        <div v-if="todo.end_date" class="context-menu-item" @click="setDueDateFromMenu(null)">
          Clear due date
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-label">Move to:</div>
        <div
          v-for="project in projects"
          :key="project.id"
          class="context-menu-item"
          :class="{ active: todo.project_id === project.id }"
          @click="moveToProjectFromMenu(project.id)"
        >
          <span class="project-dot" :style="{ background: project.color }"></span>
          {{ project.name }}
        </div>
        <div
          class="context-menu-item"
          :class="{ active: !todo.project_id }"
          @click="moveToProjectFromMenu(null)"
        >
          Inbox
        </div>
      </div>
    </Teleport>
    <div class="card-header">
      <input
        v-if="!isTrashView"
        type="checkbox"
        :checked="todo.completed"
        @click.stop="$emit('toggle-complete')"
      />
      <input
        v-if="isEditing"
        ref="titleInput"
        v-model="editingTitle"
        class="card-title-input"
        @keydown.enter.prevent="saveTitle"
        @keydown.escape.prevent="cancelEdit"
        @blur="onTitleBlur"
        @click.stop
      />
      <span v-else class="card-title" @click.stop @dblclick.stop="startEdit">{{ todo.title }}</span>
      <button
        class="fullscreen-btn"
        title="Open full screen"
        @click.stop="$emit('open-fullscreen')"
      >
        <Maximize2 :size="14" />
      </button>
      <template v-if="isTrashView">
        <button
          class="restore-btn"
          title="Restore from trash (Ctrl+Z to undo)"
          @click.stop="$emit('restore')"
        >
          <RotateCcw :size="14" />
        </button>
        <button
          class="delete-btn permanent"
          title="Delete permanently (cannot be undone)"
          @click.stop="$emit('permanent-delete')"
        >
          <Trash2 :size="14" />
        </button>
      </template>
      <template v-else-if="isArchiveView">
        <button
          class="restore-btn"
          title="Unarchive - move back to active (Ctrl+Z to undo)"
          @click.stop="$emit('unarchive')"
        >
          <RotateCcw :size="14" />
        </button>
        <button
          class="delete-btn"
          title="Move to trash (Ctrl+Z to undo)"
          @click.stop="$emit('delete')"
        >
          <Trash2 :size="14" />
        </button>
      </template>
      <template v-else>
        <button
          class="archive-btn"
          title="Archive - hide from active view (Ctrl+Z to undo)"
          @click.stop="$emit('archive')"
        >
          <Archive :size="14" />
        </button>
        <button
          class="delete-btn"
          title="Move to trash (Ctrl+Z to undo)"
          @click.stop="$emit('delete')"
        >
          <Trash2 :size="14" />
        </button>
      </template>
    </div>
    <div v-if="(todo.project_name && showProject) || todo.end_date" class="card-meta">
      <span
        v-if="todo.project_name && showProject"
        class="card-project"
        :style="{ background: todo.project_color + '33', color: todo.project_color }"
      >
        {{ todo.project_name }}
      </span>
      <span
        v-if="todo.end_date"
        class="card-deadline"
        :class="{ overdue: isOverdue(todo.end_date) }"
      >
        Due: {{ formatDeadline(todo.end_date) }}
      </span>
    </div>
    <div v-if="!isCollapsed" class="card-dates-info">
      <span v-if="todo.created_at">Created: {{ formatCreatedDate(todo.created_at) }}</span>
      <span v-if="todo.completed_at">Done: {{ formatCreatedDate(todo.completed_at) }}</span>
    </div>
    <div
      v-if="!todo.notes && !isEditingNotes && !isCollapsed"
      class="add-notes-link"
      @click.stop="startNotesEdit"
    >
      + Add notes
    </div>
    <div
      v-if="(todo.notes || isEditingNotes) && (!isCollapsed || alwaysShowNotes)"
      class="card-notes-preview"
    >
      <div v-if="isEditingNotes" @click.stop @mousedown.stop>
        <NotesEditor
          ref="notesEditor"
          autofocus
          :model-value="editingNotes"
          @update:model-value="editingNotes = $event"
          @blur="onNotesBlur"
        />
      </div>
      <div v-else class="markdown-body" @click.stop="startNotesEdit">
        <div v-if="todo.notes_sensitive" class="sensitive-notes-card">
          <span class="sensitive-icon-small">L</span>
          <span class="sensitive-text">Sensitive content hidden</span>
        </div>
        <div v-else v-html="renderCardNotes(todo.notes)"></div>
      </div>
    </div>
  </div>
</template>

<script>
  import NotesEditor from './NotesEditor.vue'
  import { Archive, Maximize2, Trash2, RotateCcw } from 'lucide-vue-next'
  import cardInteractionsMixin from './cardInteractionsMixin.js'

  export default {
    name: 'CardItem',
    components: {
      NotesEditor,
      Archive,
      Maximize2,
      Trash2,
      RotateCcw
    },
    mixins: [cardInteractionsMixin],
    props: {
      todo: {
        type: Object,
        required: true
      },
      selected: {
        type: Boolean,
        default: false
      },
      focused: {
        type: Boolean,
        default: false
      },
      isTrashView: {
        type: Boolean,
        default: false
      },
      isArchiveView: {
        type: Boolean,
        default: false
      },
      cardStyle: {
        type: Object,
        default: () => ({})
      },
      showProject: {
        type: Boolean,
        default: false
      },
      // In card (square) mode the note preview is shown even while the card is
      // collapsed, so the extra tile space is used.
      alwaysShowNotes: {
        type: Boolean,
        default: false
      },
      isDraggable: {
        type: Boolean,
        default: false
      },
      selectedTodoIds: {
        type: Set,
        default: () => new Set()
      },
      projects: {
        type: Array,
        default: () => []
      }
    },
    emits: [
      'click',
      'toggle-complete',
      'delete',
      'restore',
      'permanent-delete',
      'unarchive',
      'dragstart',
      'update-title',
      'update-notes',
      'archive',
      'move-to-project',
      'set-due-date',
      'open-fullscreen'
    ],
    methods: {
      onDragStart(event) {
        // If this card is part of multi-selection, drag all selected items
        let idsToTransfer = [this.todo.id]
        if (this.selectedTodoIds.has(this.todo.id) && this.selectedTodoIds.size > 1) {
          idsToTransfer = [...this.selectedTodoIds]
        }
        event.dataTransfer.setData('text/plain', JSON.stringify(idsToTransfer))
        event.dataTransfer.effectAllowed = 'move'
        this.$emit('dragstart', event)
      },
      handleClick(event) {
        // Don't toggle when editing
        if (this.isEditingNotes || this.isEditing) {
          return
        }
        this.isCollapsed = !this.isCollapsed
        this.$emit('click', event)
      },
      archiveFromMenu() {
        this.$emit('archive')
        this.hideContextMenu()
      },
      moveToProjectFromMenu(projectId) {
        this.$emit('move-to-project', projectId)
        this.hideContextMenu()
      }
    }
  }
</script>

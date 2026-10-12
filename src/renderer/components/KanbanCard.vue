<template>
  <div
    class="kanban-card"
    :class="{ completed: todo.completed, selected: selected }"
    :style="{ borderLeftColor: borderColor }"
    :data-todo-id="todo.id"
    @click="handleClick"
    @contextmenu.prevent="showContextMenu($event)"
  >
    <!-- Context Menu (teleported to .app so kanban column scroll/overflow cannot
         clip it while still inheriting the app's theme variables) -->
    <Teleport to=".app">
      <div
        v-if="contextMenuVisible"
        ref="contextMenu"
        class="card-context-menu"
        :style="contextMenuStyle"
        @click.stop
      >
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
      </div>
    </Teleport>
    <div class="card-header">
      <input type="checkbox" :checked="todo.completed" @click.stop="$emit('toggle-complete')" />
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
      <div class="card-actions">
        <button
          class="fullscreen-btn"
          title="Open full screen"
          @click.stop="$emit('open-fullscreen')"
        >
          <Maximize2 :size="14" />
        </button>
        <button class="archive-btn" title="Archive" @click.stop="$emit('archive')">
          <Archive :size="14" />
        </button>
        <button class="card-delete-btn" title="Delete" @click.stop="$emit('delete')">
          <Trash2 :size="14" />
        </button>
      </div>
    </div>
    <div v-if="(showProject && todo.project_name) || todo.end_date" class="card-meta">
      <span
        v-if="showProject && todo.project_name"
        class="card-project"
        :style="{ color: todo.project_color }"
        >{{ todo.project_name }}</span
      >
      <span
        v-if="todo.end_date"
        class="card-deadline"
        :class="{ overdue: isOverdue(todo.end_date) }"
      >
        Due: {{ formatDeadline(todo.end_date) }}
      </span>
    </div>
    <div v-if="todo.subtask_count > 0" class="card-subtasks">
      <div class="subtask-progress">
        <div class="subtask-bar" :style="{ width: subtaskProgress + '%' }"></div>
      </div>
      <span class="subtask-count">{{ todo.subtask_completed }}/{{ todo.subtask_count }}</span>
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
    <div v-if="(todo.notes || isEditingNotes) && !isCollapsed" class="card-notes-preview">
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
  import { Archive, Maximize2, Trash2 } from 'lucide-vue-next'
  import cardInteractionsMixin from './cardInteractionsMixin.js'

  export default {
    name: 'KanbanCard',
    components: {
      NotesEditor,
      Archive,
      Maximize2,
      Trash2
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
      borderColor: {
        type: String,
        default: '#666'
      },
      showProject: {
        type: Boolean,
        default: false
      }
    },
    emits: [
      'select',
      'toggle-complete',
      'delete',
      'update-title',
      'update-notes',
      'archive',
      'set-due-date',
      'open-fullscreen'
    ],
    computed: {
      subtaskProgress() {
        if (!this.todo.subtask_count) return 0
        return Math.round((this.todo.subtask_completed / this.todo.subtask_count) * 100)
      }
    },
    methods: {
      handleClick(event) {
        if (this.isEditingNotes || this.isEditing) {
          return
        }
        this.isCollapsed = !this.isCollapsed
        this.$emit('select', event)
      }
    }
  }
</script>

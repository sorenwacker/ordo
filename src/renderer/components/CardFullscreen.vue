<template>
  <div class="card-fullscreen" @click.self="close">
    <div class="fullscreen-content" @click.stop>
      <div class="fullscreen-header">
        <input
          v-if="isEditing"
          ref="titleInput"
          v-model="editingTitle"
          class="fullscreen-title-input"
          @keydown.enter.prevent="saveTitle"
          @blur="onTitleBlur"
        />
        <h2 v-else class="fullscreen-title" @dblclick="startEdit">{{ todo.title }}</h2>
        <button class="fullscreen-close" title="Close (Esc)" @click="close">
          <X :size="18" />
        </button>
      </div>
      <div v-if="todo.project_name || todo.end_date" class="fullscreen-meta">
        <span v-if="todo.project_name" class="card-project" :style="{ color: todo.project_color }">
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
      <div class="fullscreen-notes">
        <NotesEditor
          v-if="isEditingNotes"
          ref="notesEditor"
          autofocus
          :model-value="editingNotes"
          @update:model-value="editingNotes = $event"
          @blur="onNotesBlur"
        />
        <div v-else class="markdown-body" @click="startNotesEdit">
          <div v-if="todo.notes_sensitive" class="sensitive-notes-card">
            <span class="sensitive-icon-small">L</span>
            <span class="sensitive-text">Sensitive content hidden</span>
          </div>
          <div v-else-if="todo.notes" v-html="renderCardNotes(todo.notes)"></div>
          <div v-else class="add-notes-link">+ Add notes</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import NotesEditor from './NotesEditor.vue'
  import { X } from 'lucide-vue-next'
  import cardInteractionsMixin from './cardInteractionsMixin.js'

  /**
   * A todo opened over the whole window. Title and notes edit in place through
   * the shared card mixin, so the overlay emits the same events as the card it
   * was opened from. See docs/fullscreen.md.
   */
  export default {
    name: 'CardFullscreen',
    components: {
      NotesEditor,
      X
    },
    mixins: [cardInteractionsMixin],
    props: {
      todo: {
        type: Object,
        required: true
      }
    },
    emits: ['close', 'update-title', 'update-notes'],
    mounted() {
      // Capture phase, so Escape is consumed here before the application's own
      // window listener can act on it.
      window.addEventListener('keydown', this.onKeyDown, { capture: true })
    },
    beforeUnmount() {
      window.removeEventListener('keydown', this.onKeyDown, { capture: true })
    },
    methods: {
      onKeyDown(event) {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopImmediatePropagation()
        // First Escape leaves an open editor, the second closes the overlay.
        if (this.isEditing) {
          this.cancelEdit()
          return
        }
        if (this.isEditingNotes) {
          this.saveNotes()
          return
        }
        this.$emit('close')
      },
      close() {
        this.saveTitle()
        this.saveNotes()
        this.$emit('close')
      }
    }
  }
</script>

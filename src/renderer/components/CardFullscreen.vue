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
      <div v-if="isSearching" class="fullscreen-search">
        <input
          ref="searchInput"
          v-model="searchQuery"
          class="fullscreen-search-input"
          placeholder="Find in notes"
          @keydown.enter.prevent="stepMatch($event.shiftKey ? -1 : 1)"
        />
        <span class="fullscreen-search-count">{{ searchCounter }}</span>
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
        <div v-else class="markdown-body" @dblclick="openNotesEditor">
          <div v-if="todo.notes_sensitive" class="sensitive-notes-card">
            <span class="sensitive-icon-small">L</span>
            <span class="sensitive-text">Sensitive content hidden</span>
          </div>
          <div v-else-if="todo.notes" ref="renderedNotes" v-html="renderCardNotes(todo.notes)"></div>
          <div v-else class="add-notes-link" @click="startNotesEdit">+ Add notes</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import NotesEditor from './NotesEditor.vue'
  import { X } from 'lucide-vue-next'
  import cardInteractionsMixin from './cardInteractionsMixin.js'
  import { highlightMatches, clearHighlights } from '../utils/highlightMatches.js'

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
    data() {
      return {
        isSearching: false,
        searchQuery: '',
        matches: [],
        currentMatch: -1
      }
    },
    computed: {
      searchCounter() {
        return `${this.matches.length ? this.currentMatch + 1 : 0} of ${this.matches.length}`
      }
    },
    watch: {
      searchQuery() {
        this.refreshMatches()
      },
      // A re-render of the notes replaces the highlighted nodes.
      'todo.notes'() {
        if (this.isSearching) this.$nextTick(this.refreshMatches)
      },
      isEditingNotes(editing) {
        if (!editing && this.isSearching) this.$nextTick(this.refreshMatches)
      }
    },
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
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
          // The notes editor has CodeMirror's own search.
          if (this.isEditingNotes) return
          event.preventDefault()
          event.stopImmediatePropagation()
          this.openSearch()
          return
        }
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
        if (this.isSearching) {
          this.closeSearch()
          return
        }
        this.$emit('close')
      },
      openSearch() {
        this.isSearching = true
        this.$nextTick(() => {
          this.$refs.searchInput?.focus()
          this.$refs.searchInput?.select()
        })
      },
      closeSearch() {
        this.isSearching = false
        this.searchQuery = ''
        if (this.$refs.renderedNotes) clearHighlights(this.$refs.renderedNotes)
        this.matches = []
        this.currentMatch = -1
      },
      refreshMatches() {
        const root = this.$refs.renderedNotes
        this.matches = root ? highlightMatches(root, this.searchQuery) : []
        this.currentMatch = this.matches.length ? 0 : -1
        this.showCurrentMatch()
      },
      stepMatch(direction) {
        if (!this.matches.length) return
        const count = this.matches.length
        this.currentMatch = (this.currentMatch + direction + count) % count
        this.showCurrentMatch()
      },
      showCurrentMatch() {
        this.matches.forEach((mark, i) => mark.classList.toggle('current', i === this.currentMatch))
        this.matches[this.currentMatch]?.scrollIntoView?.({ block: 'center' })
      },
      openNotesEditor() {
        // The overlay is for reading, so notes open on a double-click. That
        // double-click selects a word, which the shared selection guard would
        // read as "copying, not editing"; clear it first (see docs/fullscreen.md).
        window.getSelection()?.removeAllRanges()
        this.startNotesEdit()
      },
      close() {
        this.saveTitle()
        this.saveNotes()
        this.$emit('close')
      }
    }
  }
</script>

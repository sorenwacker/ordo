<template>
  <div
    ref="cardsViewRef"
    class="cards-view"
    :class="{ 'light-theme': theme === 'light', 'cards-preview': cardColumns > 1 }"
    @mousedown="onContainerMouseDown"
    @mousemove="onContainerMouseMove"
    @mouseup="onContainerMouseUp"
    @mouseleave="onContainerMouseUp"
  >
    <!-- Selection Box -->
    <div v-if="isSelecting" class="selection-box" :style="selectionBoxStyle"></div>
    <template v-if="groupByProject">
      <div
        class="cards-groups-container"
        :style="{ '--card-columns': cardColumns, '--card-min-width': cardMinWidth }"
      >
        <div v-for="group in groupedTodos" :key="group.id" class="cards-group">
          <div class="group-header" :style="{ borderLeftColor: group.color || '#666' }">
            <span class="group-dot" :style="{ background: group.color || '#666' }"></span>
            <span class="group-name">{{ group.name }}</span>
            <span class="group-count">{{ group.todos.length }}</span>
          </div>
          <button class="add-card-btn" @click="$emit('add-todo-to-project', group.id)">
            + Add
          </button>
          <draggable
            :model-value="group.todos"
            item-key="id"
            class="cards-grid masonry"
            :style="{ '--card-columns': cardColumns, '--card-min-width': cardMinWidth }"
            ghost-class="ghost"
            :disabled="sortBy !== 'manual'"
            @update:model-value="$emit('update-group-todos', group.id, $event)"
          >
            <template #item="{ element }">
              <CardItem
                :todo="element"
                :selected="selectedTodoId === element.id || selectedTodoIds.has(element.id)"
                :focused="focusedTodoId === element.id"
                :is-trash-view="isTrashView"
                :is-archive-view="isArchiveView"
                :selected-todo-ids="selectedTodoIds"
                :card-style="getCardStyle(element.id, element.project_color)"
                :current-filter="currentFilter"
                :show-project="false"
                :always-show-notes="cardColumns > 1"
                :projects="projects"
                @click="$emit('card-click', $event, element.id)"
                @toggle-complete="$emit('toggle-complete', element)"
                @delete="$emit('delete-todo', element.id)"
                @restore="$emit('restore-todo', element.id)"
                @permanent-delete="$emit('permanent-delete-todo', element.id)"
                @unarchive="$emit('unarchive-todo', element.id)"
                @update-title="$emit('update-title', element, $event)"
                @update-notes="$emit('update-notes', element, $event)"
                @archive="$emit('archive-todo', element.id)"
                @move-to-project="$emit('move-to-project', element, $event)"
                @set-due-date="$emit('set-due-date', element, $event)"
                @open-fullscreen="$emit('open-fullscreen', element)"
              />
            </template>
          </draggable>
        </div>
      </div>
    </template>
    <template v-else>
      <draggable
        :model-value="sortedTodos"
        item-key="id"
        class="cards-grid masonry"
        :style="{ '--card-columns': cardColumns, '--card-min-width': cardMinWidth }"
        ghost-class="ghost"
        :disabled="sortBy !== 'manual'"
        @update:model-value="$emit('update-sorted-todos', $event)"
      >
        <template #item="{ element }">
          <CardItem
            :todo="element"
            :selected="selectedTodoId === element.id || selectedTodoIds.has(element.id)"
            :focused="focusedTodoId === element.id"
            :is-trash-view="isTrashView"
            :is-archive-view="isArchiveView"
            :selected-todo-ids="selectedTodoIds"
            :card-style="getCardStyle(element.id, element.project_color)"
            :current-filter="currentFilter"
            :show-project="currentFilter === null || currentFilter === 'archive'"
            :always-show-notes="cardColumns > 1"
            :projects="projects"
            @click="$emit('card-click', $event, element.id)"
            @toggle-complete="$emit('toggle-complete', element)"
            @delete="$emit('delete-todo', element.id)"
            @restore="$emit('restore-todo', element.id)"
            @permanent-delete="$emit('permanent-delete-todo', element.id)"
            @unarchive="$emit('unarchive-todo', element.id)"
            @update-title="$emit('update-title', element, $event)"
            @update-notes="$emit('update-notes', element, $event)"
            @archive="$emit('archive-todo', element.id)"
            @move-to-project="$emit('move-to-project', element, $event)"
            @set-due-date="$emit('set-due-date', element, $event)"
            @open-fullscreen="$emit('open-fullscreen', element)"
          />
        </template>
      </draggable>
    </template>
  </div>
</template>

<script>
  import draggable from 'vuedraggable'
  import CardItem from './CardItem.vue'
  import { CARD_MIN_WIDTHS, DEFAULT_CARD_WIDTH } from '../utils/cardWidth.js'

  export default {
    name: 'CardsView',
    components: {
      draggable,
      CardItem
    },
    props: {
      theme: {
        type: String,
        default: 'dark'
      },
      sortedTodos: {
        type: Array,
        default: () => []
      },
      groupedTodos: {
        type: Array,
        default: () => []
      },
      groupByProject: {
        type: Boolean,
        default: false
      },
      selectedTodoId: {
        type: Number,
        default: null
      },
      selectedTodoIds: {
        type: Set,
        default: () => new Set()
      },
      focusedTodoId: {
        type: Number,
        default: null
      },
      isTrashView: {
        type: Boolean,
        default: false
      },
      isArchiveView: {
        type: Boolean,
        default: false
      },
      cardColumns: {
        type: Number,
        default: 3
      },
      // Minimum card width for the card-mode auto-fill grid, as a CSS length.
      cardMinWidth: {
        type: String,
        default: CARD_MIN_WIDTHS[DEFAULT_CARD_WIDTH]
      },
      sortBy: {
        type: String,
        default: 'manual'
      },
      currentFilter: {
        type: [Number, String],
        default: null
      },
      projects: {
        type: Array,
        default: () => []
      }
    },
    emits: [
      'card-click',
      'toggle-complete',
      'delete-todo',
      'restore-todo',
      'permanent-delete-todo',
      'unarchive-todo',
      'update-sorted-todos',
      'update-group-todos',
      'add-todo-to-project',
      'marquee-select',
      'update-title',
      'update-notes',
      'archive-todo',
      'move-to-project',
      'set-due-date',
      'open-fullscreen',
      'clear-selection'
    ],
    data() {
      return {
        // Marquee selection
        isSelecting: false,
        selectionStart: { x: 0, y: 0 },
        selectionCurrent: { x: 0, y: 0 }
      }
    },
    computed: {
      selectionBoxStyle() {
        const left = Math.min(this.selectionStart.x, this.selectionCurrent.x)
        const top = Math.min(this.selectionStart.y, this.selectionCurrent.y)
        const width = Math.abs(this.selectionCurrent.x - this.selectionStart.x)
        const height = Math.abs(this.selectionCurrent.y - this.selectionStart.y)
        return {
          left: left + 'px',
          top: top + 'px',
          width: width + 'px',
          height: height + 'px'
        }
      }
    },
    methods: {
      getCardStyle(todoId, projectColor) {
        const style = {}
        if (projectColor) {
          style.borderLeftColor = projectColor
        }
        return style
      },
      // Marquee selection methods
      onContainerMouseDown(event) {
        // Only start selection if clicking on empty space (not on a card or interactive element)
        const target = event.target
        const isCard = target.closest('.todo-card, .kanban-card, button, input, select, a')
        if (isCard) return

        // Empty space: drop the current selection before a marquee may build
        // a new one (see docs/selection.md).
        this.$emit('clear-selection')

        // Get position relative to container
        const container = this.$refs.cardsViewRef
        const rect = container.getBoundingClientRect()
        const x = event.clientX - rect.left + container.scrollLeft
        const y = event.clientY - rect.top + container.scrollTop

        this.isSelecting = true
        this.selectionStart = { x, y }
        this.selectionCurrent = { x, y }

        // Prevent text selection
        event.preventDefault()
      },
      onContainerMouseMove(event) {
        if (!this.isSelecting) return

        const container = this.$refs.cardsViewRef
        const rect = container.getBoundingClientRect()
        const x = event.clientX - rect.left + container.scrollLeft
        const y = event.clientY - rect.top + container.scrollTop

        this.selectionCurrent = { x, y }

        // Find cards that intersect with selection box
        this.updateSelectionFromBox()
      },
      onContainerMouseUp() {
        if (!this.isSelecting) return

        // Finalize selection
        this.updateSelectionFromBox()
        this.isSelecting = false
      },
      updateSelectionFromBox() {
        const container = this.$refs.cardsViewRef
        if (!container) return

        // Calculate selection box bounds
        const boxLeft = Math.min(this.selectionStart.x, this.selectionCurrent.x)
        const boxTop = Math.min(this.selectionStart.y, this.selectionCurrent.y)
        const boxRight = Math.max(this.selectionStart.x, this.selectionCurrent.x)
        const boxBottom = Math.max(this.selectionStart.y, this.selectionCurrent.y)

        // Skip if selection is too small (likely just a click)
        if (boxRight - boxLeft < 10 && boxBottom - boxTop < 10) return

        // Find all cards in the container
        const cards = container.querySelectorAll('.todo-card')
        const containerRect = container.getBoundingClientRect()
        const selectedIds = []

        cards.forEach((card) => {
          const cardRect = card.getBoundingClientRect()
          // Convert card rect to container-relative coordinates
          const cardLeft = cardRect.left - containerRect.left + container.scrollLeft
          const cardTop = cardRect.top - containerRect.top + container.scrollTop
          const cardRight = cardLeft + cardRect.width
          const cardBottom = cardTop + cardRect.height

          // Check intersection
          const intersects = !(
            cardRight < boxLeft ||
            cardLeft > boxRight ||
            cardBottom < boxTop ||
            cardTop > boxBottom
          )

          if (intersects) {
            // Get todo ID from data attribute
            const todoId = parseInt(card.dataset.todoId)
            if (todoId) {
              selectedIds.push(todoId)
            }
          }
        })

        if (selectedIds.length > 0) {
          this.$emit('marquee-select', selectedIds)
        }
      }
    }
  }
</script>

<style scoped>
  .cards-view {
    position: relative;
  }

  .selection-box {
    position: absolute;
    border: 2px solid rgba(26, 111, 171, 0.8);
    background: rgba(26, 111, 171, 0.15);
    pointer-events: none;
    z-index: 100;
    border-radius: 2px;
  }
</style>

<template>
  <div v-if="item" class="graph-tooltip" :style="positionStyle">
    <div class="tooltip-title">{{ item.title || item.name }}</div>
    <div v-if="item.project_name" class="tooltip-project">{{ item.project_name }}</div>
    <div v-if="item.end_date" class="tooltip-deadline">
      Due: {{ formatDeadline(item.end_date) }}
    </div>
    <div
      v-if="item.notes && !item.notes_sensitive"
      class="tooltip-notes markdown-body"
      v-html="renderNotes(item.notes)"
    ></div>
    <div v-else-if="item.notes_sensitive" class="tooltip-notes sensitive">
      Sensitive content hidden
    </div>
  </div>
</template>

<script>
  import { renderCardMarkdown } from '../utils/markdown.js'
  import { formatDeadline } from '../utils/dueDates.js'

  export default {
    name: 'ItemPreview',
    props: {
      item: {
        type: Object,
        default: null
      },
      position: {
        type: Object,
        default: null
      }
    },
    computed: {
      positionStyle() {
        if (!this.position) return {}
        return {
          left: this.position.x + 'px',
          top: this.position.y + 'px'
        }
      }
    },
    methods: {
      renderNotes(notes) {
        if (!notes) return ''
        const processed = notes.replace(/`{3,}\s*mermaid\b[\s\S]*?`{3,}/gi, '[diagram]')
        return renderCardMarkdown(processed)
      },
      formatDeadline
    }
  }
</script>

<style scoped>
  .tooltip-notes.sensitive {
    color: #888;
    font-style: italic;
  }
</style>

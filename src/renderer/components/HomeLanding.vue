<template>
  <div class="home-landing">
    <!-- Project Drop Targets -->
    <div class="project-drop-targets">
      <div
        v-for="project in projects"
        :key="project.id"
        class="project-drop-target"
        :class="{ 'drag-over': dragOverProjectId === project.id }"
        :style="{ borderColor: project.color, '--project-color': project.color }"
        @click="$emit('select-project', project.id)"
        @dragover.prevent="dragOverProjectId = project.id"
        @dragleave="dragOverProjectId = null"
        @drop.prevent="dropOnProject(project.id)"
      >
        <span class="project-name">{{ project.name }}</span>
        <span v-if="openCount(projectCounts[project.id]) > 0" class="project-count">{{
          openCount(projectCounts[project.id])
        }}</span>
      </div>
    </div>

    <!-- Inbox Items (draggable) -->
    <div class="inbox-landing">
      <h2 v-if="inboxTodos.length > 0">Inbox</h2>
      <div class="inbox-items cards-grid">
        <CardItem
          v-for="todo in inboxTodos"
          :key="todo.id"
          :todo="todo"
          :is-draggable="true"
          :projects="projects"
          :show-project="false"
          @toggle-complete="$emit('toggle-complete', todo)"
          @delete="$emit('delete-todo', todo.id)"
          @update-title="$emit('update-title', todo, $event)"
          @update-notes="$emit('update-notes', todo, $event)"
          @archive="$emit('archive-todo', todo.id)"
          @move-to-project="$emit('move-to-project', todo, $event)"
          @set-due-date="$emit('set-due-date', todo, $event)"
          @dragstart="onInboxDragStart($event, todo)"
        />
      </div>
      <p v-if="inboxTodos.length === 0" class="empty-inbox">
        No items in inbox. Add one above or drag items here.
      </p>
    </div>
  </div>
</template>

<script>
  import CardItem from './CardItem.vue'
  import { openCount } from '../utils/counts.js'

  export default {
    name: 'HomeLanding',
    components: {
      CardItem
    },
    props: {
      projects: { type: Array, default: () => [] },
      projectCounts: { type: Object, default: () => ({}) },
      inboxTodos: { type: Array, default: () => [] }
    },
    emits: [
      'select-project',
      'drop-todo-on-project',
      'toggle-complete',
      'delete-todo',
      'update-title',
      'update-notes',
      'archive-todo',
      'move-to-project',
      'set-due-date'
    ],
    data() {
      return {
        dragOverProjectId: null,
        draggingTodo: null
      }
    },
    methods: {
      openCount,
      onInboxDragStart(event, todo) {
        this.draggingTodo = todo
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', todo.id)
      },
      dropOnProject(projectId) {
        this.dragOverProjectId = null
        if (!this.draggingTodo) return
        this.$emit('drop-todo-on-project', this.draggingTodo, projectId)
        this.draggingTodo = null
      }
    }
  }
</script>

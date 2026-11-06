<template>
  <div class="project-modal" @click.self="$emit('close')">
    <div class="modal-content" @click.stop>
      <template v-if="!result">
        <h3>Reset Database</h3>
        <p>
          This removes all projects, todos, notes, tags, and statuses from the active database. The
          current file is kept as a backup next to it.
        </p>
        <p>Type <strong>yes</strong> to enable the reset.</p>
        <input v-model="confirmation" type="text" placeholder="yes" @keyup.enter="confirm" />
        <div class="modal-actions">
          <button class="delete-btn" :disabled="!confirmed || pending" @click.stop="confirm">
            Reset Database
          </button>
          <button @click.stop="$emit('close')">Cancel</button>
        </div>
      </template>
      <template v-else-if="result.success">
        <h3>Database Reset</h3>
        <p>The previous database was saved as:</p>
        <p class="backup-path">{{ result.backupPath }}</p>
        <p>To restore it, quit the app, rename the backup file back, and start again.</p>
        <div class="modal-actions">
          <button class="primary" @click.stop="$emit('close')">Close</button>
        </div>
      </template>
      <template v-else>
        <h3>Reset Failed</h3>
        <p>The database was left unchanged.</p>
        <p class="backup-path">{{ result.error }}</p>
        <div class="modal-actions">
          <button @click.stop="$emit('close')">Close</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script>
  export default {
    name: 'ResetDatabaseModal',
    props: {
      result: { type: Object, default: null }
    },
    emits: ['close', 'confirm'],
    data() {
      return {
        confirmation: '',
        // Set on the first confirm. A second reset would back up the already
        // emptied database and show that file as the backup to restore.
        pending: false
      }
    },
    computed: {
      confirmed() {
        return this.confirmation.trim().toLowerCase() === 'yes'
      }
    },
    methods: {
      confirm() {
        if (!this.confirmed || this.pending) return
        this.pending = true
        this.$emit('confirm')
      }
    }
  }
</script>

<style scoped>
  .backup-path {
    word-break: break-all;
    font-family: monospace;
    font-size: 0.85em;
  }

  .delete-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>

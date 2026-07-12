<script setup lang="ts">
import { RouterView, RouterLink } from 'vue-router'
</script>

<template>
  <div class="console-app">
    <header class="console-topbar">
      <RouterLink class="console-brand" to="/admin">🎯 Pi-Darts Konsole</RouterLink>
      <nav class="console-nav pd-row">
        <RouterLink to="/admin">Admin</RouterLink>
      </nav>
    </header>
    <main class="console-content">
      <RouterView />
    </main>
  </div>
</template>

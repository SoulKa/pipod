import 'virtual:uno.css'
import { createApp } from 'vue'
import App from './App.vue'

// This app provides its own close button (top-left ✕), so hide the launcher's default Home overlay.
// No-op (404, swallowed) when run standalone outside the launcher.
void fetch('/.launcher/home-button?hidden=1', { method: 'POST' }).catch(() => {})

createApp(App).mount('#app')

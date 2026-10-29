import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import AdminView from './views/AdminView.vue'
import LiveView from './views/LiveView.vue'
import OverviewView from './views/OverviewView.vue'
import PlayerProfileView from './views/PlayerProfileView.vue'

declare module 'vue-router' {
  interface RouteMeta {
    /**
     * A spectator screen: rendered without the console shell (no admin navigation, no
     * server-log feed), since it runs on phones and wall displays that only watch.
     */
    bare?: boolean
  }
}

const routes: RouteRecordRaw[] = [
  // Spectators land here (the QR codes link to it): it follows the active tournament.
  { path: '/', name: 'live', component: LiveView, meta: { bare: true } },
  { path: '/admin', name: 'admin', component: AdminView },
  // Overview is per-tournament so it can be opened full-screen on a big display.
  { path: '/view/:id', name: 'view', component: OverviewView, props: true, meta: { bare: true } },
  // Where players set their own picture, reached by tapping their name in the viewer.
  {
    path: '/view/:id/player/:participantId',
    name: 'player',
    component: PlayerProfileView,
    props: true,
    meta: { bare: true },
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

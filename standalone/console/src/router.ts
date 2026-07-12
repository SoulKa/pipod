import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import AdminView from './views/AdminView.vue'
import OverviewView from './views/OverviewView.vue'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/admin' },
  { path: '/admin', name: 'admin', component: AdminView },
  // Overview is per-tournament so it can be opened full-screen on a big display.
  { path: '/view/:id', name: 'view', component: OverviewView, props: true },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

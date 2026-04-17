/**
 * api.ts — Central Axios-based HTTP client for EnterOS.
 * All services should import and use this instance.
 */
import axios from 'axios'

// Install axios first: npm install axios
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api'

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})

// ─── Request interceptor: attach auth token ───────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('enteros_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ─── Response interceptor: handle global errors ───────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('enteros_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

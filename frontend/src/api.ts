import axios from 'axios';

// VITE_API_URL is set at build time for cloud deploys (e.g. https://xxx.onrender.com/api).
// Falls back to /api for local dev where nginx proxies the call.
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api' });

const ACCESS = 'tt_access';
const REFRESH = 'tt_refresh';

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS);
  },
  get refresh() {
    return localStorage.getItem(REFRESH);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS, access);
    localStorage.setItem(REFRESH, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
  },
};

// Attach the access token to every request.
api.interceptors.request.use((config) => {
  const t = tokens.access;
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

// On 401, try to rotate the refresh token once, then retry the request.
let refreshing: Promise<string> | null = null;
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && tokens.refresh) {
      original._retry = true;
      try {
        refreshing =
          refreshing ??
          axios
            .post(`${import.meta.env.VITE_API_URL ?? '/api'}/auth/refresh`, { refreshToken: tokens.refresh })
            .then((res) => {
              tokens.set(res.data.accessToken, res.data.refreshToken);
              return res.data.accessToken as string;
            });
        const newAccess = await refreshing;
        refreshing = null;
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      } catch {
        refreshing = null;
        tokens.clear();
        window.location.reload();
      }
    }
    return Promise.reject(error);
  },
);

// ---- typed API helpers ----

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'BLOCKED';
  assigneeId?: string | null;
  dueDate?: string | null;
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'MANAGER' | 'MEMBER';
}

export interface Project {
  id: string;
  name: string;
}

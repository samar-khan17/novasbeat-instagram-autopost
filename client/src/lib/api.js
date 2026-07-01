// Tiny axios wrapper. Uses the Vite dev proxy (/api → :3001), so a relative
// baseURL works in dev and in a same-origin production deploy.
import axios from 'axios';

const api = axios.create({ baseURL: '/api', timeout: 180000 });

export default api;

// Convenience helpers
export const getStats     = () => api.get('/stats').then((r) => r.data);
export const getArticles  = (status) => api.get('/articles', { params: status ? { status } : {} }).then((r) => r.data);
export const getQueue     = () => api.get('/queue').then((r) => r.data);
export const postNow      = (id, override) => api.post(`/post-now/${id}`, override || {}).then((r) => r.data);
export const previewPost  = (id, opts) => api.post(`/preview/${id}`, opts || {}).then((r) => r.data);
export const skipArticle  = (id) => api.post(`/skip/${id}`).then((r) => r.data);
export const deleteArticle= (id) => api.delete(`/articles/${id}`).then((r) => r.data);
export const scrapeNow    = () => api.post('/scrape-now').then((r) => r.data);
export const getSettings  = () => api.get('/settings').then((r) => r.data);
export const saveSettings = (obj) => api.post('/settings', obj).then((r) => r.data);
export const testInstagram= () => api.post('/test-instagram').then((r) => r.data);
export const testGrok     = () => api.post('/test-grok').then((r) => r.data);
export const testNvidia   = () => api.post('/test-nvidia').then((r) => r.data);
export const editorEnhance= (id, brandColors) => api.post(`/editor/enhance/${id}`, { brandColors }).then((r) => r.data);
export const editorRecreate=(id, prompt) => api.post(`/editor/recreate/${id}`, { prompt }).then((r) => r.data);
export const editorBranded = (id, opts) => api.post(`/editor/branded/${id}`, opts || {}).then((r) => r.data);
export const editorSave   = (id, imageUrl, mode) => api.post(`/editor/save/${id}`, { imageUrl, mode }).then((r) => r.data);
export const previewStory = (id, opts) => api.post(`/story-preview/${id}`, opts || {}).then((r) => r.data);
export const batchPost       = (ids) => api.post('/batch-post', { ids }).then((r) => r.data);
export const deleteArticles  = (ids) => api.delete('/articles', { data: { ids } }).then((r) => r.data);

import axios from 'axios';

// Set the base URL for your FastAPI backend
const api = axios.create({
  baseURL: 'http://localhost:8000',
});

// Interceptor: Automatically attach the token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;
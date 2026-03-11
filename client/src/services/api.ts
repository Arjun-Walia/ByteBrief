import axios from 'axios';
import type { Article, Category, PaginatedResponse, ApiResponse, User } from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const articlesApi = {
  getArticles: async (page = 1, limit = 20): Promise<PaginatedResponse<Article>> => {
    const response = await api.get<ApiResponse<PaginatedResponse<Article>>>(
      `/articles?page=${page}&limit=${limit}`
    );
    return response.data.data!;
  },

  getTopArticles: async (limit = 10): Promise<Article[]> => {
    const response = await api.get<ApiResponse<Article[]>>(`/articles/top?limit=${limit}`);
    return response.data.data!;
  },

  getArticleById: async (id: string): Promise<Article> => {
    const response = await api.get<ApiResponse<Article>>(`/articles/${id}`);
    return response.data.data!;
  },

  getArticlesByCategory: async (slug: string, page = 1): Promise<PaginatedResponse<Article>> => {
    const response = await api.get<ApiResponse<PaginatedResponse<Article>>>(
      `/articles/category/${slug}?page=${page}`
    );
    return response.data.data!;
  },

  searchArticles: async (query: string, page = 1): Promise<PaginatedResponse<Article>> => {
    const response = await api.get<ApiResponse<PaginatedResponse<Article>>>(
      `/articles/search?q=${encodeURIComponent(query)}&page=${page}`
    );
    return response.data.data!;
  },
};

export const categoriesApi = {
  getCategories: async (): Promise<Category[]> => {
    const response = await api.get<ApiResponse<Category[]>>('/categories');
    return response.data.data!;
  },

  getCategoryBySlug: async (slug: string): Promise<Category> => {
    const response = await api.get<ApiResponse<Category>>(`/categories/${slug}`);
    return response.data.data!;
  },
};

export const usersApi = {
  register: async (email: string, password: string, displayName?: string) => {
    const response = await api.post<ApiResponse<{ user: User; token: string }>>('/users/register', {
      email,
      password,
      displayName,
    });
    return response.data.data!;
  },

  login: async (email: string, password: string) => {
    const response = await api.post<ApiResponse<{ user: User; token: string }>>('/users/login', {
      email,
      password,
    });
    return response.data.data!;
  },

  getProfile: async (): Promise<User> => {
    const response = await api.get<ApiResponse<User>>('/users/profile');
    return response.data.data!;
  },

  getBookmarks: async (): Promise<Article[]> => {
    const response = await api.get<ApiResponse<Article[]>>('/users/bookmarks');
    return response.data.data!;
  },

  addBookmark: async (articleId: string): Promise<void> => {
    await api.post(`/users/bookmarks/${articleId}`);
  },

  removeBookmark: async (articleId: string): Promise<void> => {
    await api.delete(`/users/bookmarks/${articleId}`);
  },
};

export default api;

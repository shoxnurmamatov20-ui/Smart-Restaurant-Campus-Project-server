import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { ApiError } from '@restaurant/types';

export type RestaurantClientConfig = {
  baseURL: string;
  token?: string;
  onUnauthorized?: () => void;
};

/**
 * Create a configured Axios instance for the Smart Restaurant Campus Laravel API.
 *
 * Endpoints will be added here as the API grows. For now this exports
 * a base client that apps (web/admin/mobile) can use.
 */
export function createClient(config: RestaurantClientConfig): AxiosInstance {
  const client = axios.create({
    baseURL: config.baseURL,
    timeout: 30_000,
    withCredentials: true,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (config.token) {
    client.defaults.headers.common['Authorization'] = `Bearer ${config.token}`;
  }

  client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error?.response?.status === 401 && config.onUnauthorized) {
        config.onUnauthorized();
      }
      return Promise.reject(error);
    },
  );

  return client;
}

export function isApiError(error: unknown): error is { response: { data: ApiError } } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response: { data?: unknown } }).response?.data === 'object'
  );
}

export type { AxiosInstance, AxiosRequestConfig };

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:5000';

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  token?: string | null;
  responseType?: 'json' | 'blob' | 'text';
};

export type ApiError = {
  error: string;
};

const getStoredToken = (): string | null => {
  return sessionStorage.getItem('lad.session.token');
};

export const apiRequest = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { token, body, headers, ...rest } = options;
  // Use provided token, or fallback to stored token from sessionStorage
  const authToken = token ?? getStoredToken();
  
  const requestHeaders: HeadersInit = {
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...headers,
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const data = await response.json() as ApiError;
    const error = data?.error ?? 'Request failed';
    throw new Error(error);
  }

  // Check if responseType indicates blob
  if (rest.responseType === 'blob') {
    return response.blob() as Promise<T>;
  }

  const data = (await response.json()) as T | ApiError;
  return data as T;
};
// API client with common methods
export const apiClient = {
  async get<T>(path: string, options?: RequestOptions): Promise<{ data: T }> {
    const { responseType, ...rest } = options || {};
    const data = await apiRequest<T>(path, { ...rest, method: 'GET', responseType });
    return { data };
  },
  
  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<{ data: T }> {
    const data = await apiRequest<T>(path, { ...options, method: 'POST', body });
    return { data };
  },
  
  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<{ data: T }> {
    const data = await apiRequest<T>(path, { ...options, method: 'PUT', body });
    return { data };
  },
  
  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<{ data: T }> {
    const data = await apiRequest<T>(path, { ...options, method: 'PATCH', body });
    return { data };
  },
  
  async delete<T>(path: string, options?: RequestOptions): Promise<{ data: T }> {
    const data = await apiRequest<T>(path, { ...options, method: 'DELETE' });
    return { data };
  },
};
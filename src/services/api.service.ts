import axios, { AxiosInstance, AxiosRequestConfig, AxiosError, InternalAxiosRequestConfig } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Extended config type that includes __retryCount
interface ExtendedAxiosRequestConfig extends InternalAxiosRequestConfig {
  __retryCount?: number;
}

// API Error class for structured error handling
class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number = 500, data: any = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

class ApiService {
  private api: AxiosInstance;
  private token: string | null = null;
  private maxRetries: number = 3;
  private apiUrl: string;

  constructor() {
    this.apiUrl = process.env.COPPERX_API_URL || 'https://income-api.copperx.io';
    console.log(`[API] Initializing API service with base URL: ${this.apiUrl}`);

    this.api = axios.create({
      baseURL: this.apiUrl,
      timeout: 15000, // Increased timeout for more reliable connections
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Add a request interceptor to add the token to all requests
    this.api.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      
      // Log outgoing requests (but mask sensitive data)
      const logConfig = { ...config };
      if (logConfig.url && logConfig.url.includes('auth')) {
        console.log(`[API] Making ${config.method?.toUpperCase()} request to ${config.url}`);
        
        // Don't log full body of auth requests to avoid exposing sensitive info
        if (logConfig.data) {
          const maskedData = { ...logConfig.data };
          if (maskedData.email) maskedData.email = `${maskedData.email.substring(0, 3)}...`;
          if (maskedData.otp) maskedData.otp = '******';
          if (maskedData.password) maskedData.password = '******';
          console.log('[API] Request data (masked):', maskedData);
        }
      }
      
      return config;
    });
    
    // Add a response interceptor for error handling
    this.api.interceptors.response.use(
      response => {
        // Log successful responses (but mask sensitive data for auth endpoints)
        if (response.config.url && response.config.url.includes('auth')) {
          console.log(`[API] Received response from ${response.config.url} with status ${response.status}`);
          
          // Don't log the entire response for auth endpoints
          const maskedData = { success: true, status: response.status };
          console.log('[API] Response data (masked):', maskedData);
        }
        
        return response;
      },
      async (error: AxiosError) => {
        const config = error.config as ExtendedAxiosRequestConfig;
        
        if (!config) {
          return Promise.reject(error);
        }
        
        // Log API errors (but mask sensitive data)
        if (config.url && config.url.includes('auth')) {
          console.error(`[API] Error in ${config.method?.toUpperCase()} request to ${config.url}`);
          console.error(`[API] Status: ${error.response?.status}, Message: ${error.message}`);
        }
        
        // Initialize or get the retry count
        config.__retryCount = config.__retryCount || 0;
        
        // Check if we should retry the request
        if (this.shouldRetry(error)) {
          // Increment retry count
          config.__retryCount += 1;
          
          // Check if we've reached max retries
          if (config.__retryCount <= this.maxRetries) {
            // Exponential backoff
            const backoff = Math.pow(2, config.__retryCount) * 1000;
            
            console.log(`[API] Retrying request to ${config.url} after ${backoff}ms (attempt ${config.__retryCount}/${this.maxRetries})`);
            
            // Wait for backoff time
            await new Promise(resolve => setTimeout(resolve, backoff));
            
            // Retry the request
            return this.api(config);
          }
        }
        
        // If we shouldn't retry or max retries reached
        return Promise.reject(error);
      }
    );
  }

  private shouldRetry(error: AxiosError): boolean {
    // Retry network errors, timeouts, and certain HTTP status codes
    if (!error.response) {
      // Network error or timeout
      return true;
    }
    
    // Don't retry client errors (4xx) except for 429 (too many requests)
    if (error.response.status === 429) {
      return true;
    }
    
    // Retry on server errors (5xx)
    if (error.response.status >= 500 && error.response.status < 600) {
      return true;
    }
    
    return false;
  }

  public setToken(token: string): void {
    this.token = token;
  }

  public clearToken(): void {
    this.token = null;
  }

  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.api.get<T>(url, config);
      return response.data;
    } catch (error: any) {
      this.handleError(error);
      throw this.formatError(error);
    }
  }

  public async post<T>(url: string, data: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.api.post<T>(url, data, config);
      return response.data;
    } catch (error: any) {
      this.handleError(error);
      throw this.formatError(error);
    }
  }

  public async put<T>(url: string, data: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.api.put<T>(url, data, config);
      return response.data;
    } catch (error: any) {
      this.handleError(error);
      throw this.formatError(error);
    }
  }

  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.api.delete<T>(url, config);
      return response.data;
    } catch (error: any) {
      this.handleError(error);
      throw this.formatError(error);
    }
  }

  private handleError(error: any): void {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('API Error Response:', error.response.data);
      console.error('Status:', error.response.status);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('API Error Request:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('API Error Message:', error.message);
    }
  }
  
  private formatError(error: any): ApiError {
    if (error.response) {
      const { data, status } = error.response;
      
      // Format the error message based on the API response
      let message = 'An error occurred';
      
      if (data && data.message) {
        message = data.message;
      } else if (data && data.error) {
        message = data.error;
      } else if (typeof data === 'string') {
        message = data;
      }
      
      return new ApiError(message, status, data);
    } else if (error.request) {
      // Network error
      return new ApiError('Network error. Please check your connection.', 0);
    } else {
      // Unknown error
      return new ApiError(error.message || 'Unknown error occurred', 500);
    }
  }
  
  // Check if the API is reachable
  public async isReachable(): Promise<boolean> {
    try {
      console.log(`[API] Checking if API is reachable at ${this.apiUrl}`);
      await this.api.get('/api/health');
      console.log('[API] API is reachable');
      return true;
    } catch (error) {
      console.error('[API] API health check failed:', error);
      return false;
    }
  }
}

export default new ApiService(); 
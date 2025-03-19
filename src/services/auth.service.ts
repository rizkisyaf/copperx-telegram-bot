import apiService from './api.service';
import databaseService from './database.service';
import notificationService from './notification.service';
import { LoginResponse, ApiResponse, ProfileResponse, KycResponse } from '../interfaces/api.interface';
import { User, UserSession, OTPRequest } from '../interfaces/user.interface';

// Local session type to avoid conflicts with imported interfaces
interface SessionData {
  email?: string;
  token?: string;
  requestId?: string;
  organizationId?: string;
  isAuthenticated: boolean;
}

// Track user sessions
interface UserSessions {
  [chatId: string]: SessionData;
}

class AuthService {
  private sessions: UserSessions = {};

  // Request email OTP
  public async requestOTP(email: string, chatId: number): Promise<boolean> {
    try {
      const response = await apiService.post<ApiResponse<{ requestId: string }>>('/api/auth/email-otp/request', { email });
      
      if (!response.data || !response.data.requestId) {
        throw new Error('Failed to request OTP');
      }
      
      // Store email and requestId in session
      this.sessions[chatId] = {
        email,
        requestId: response.data.requestId,
        isAuthenticated: false
      };
      
      return true;
    } catch (error: any) {
      console.error('Error requesting OTP:', error);
      return false;
    }
  }

  // Authenticate with OTP
  public async authenticateWithOTP(otp: string, chatId: number): Promise<{ email: string } | null> {
    try {
      const session = this.sessions[chatId];
      
      if (!session || !session.email || !session.requestId) {
        throw new Error('No active login session');
      }
      
      const response = await apiService.post<ApiResponse<{ token: string; organizationId: string }>>('/api/auth/email-otp/authenticate', {
        email: session.email,
        otp,
        requestId: session.requestId
      });
      
      if (!response.data || !response.data.token) {
        throw new Error('Authentication failed');
      }
      
      // Update session with token and mark as authenticated
      this.sessions[chatId] = {
        ...session,
        token: response.data.token,
        organizationId: response.data.organizationId,
        isAuthenticated: true
      };
      
      // Register with notification service
      if (response.data.organizationId) {
        notificationService.addUserToMapping(chatId, response.data.organizationId, response.data.token);
      }
      
      return { email: session.email };
    } catch (error: any) {
      console.error('Error authenticating with OTP:', error);
      return null;
    }
  }

  // Get user session
  public getSession(chatId: number): SessionData | null {
    return this.sessions[chatId] || null;
  }

  // Check if user is authenticated
  public isAuthenticated(chatId: number): boolean {
    return !!this.sessions[chatId]?.isAuthenticated;
  }

  // Get user profile
  public async getProfile(chatId: number): Promise<any | null> {
    try {
      const session = this.sessions[chatId];
      
      if (!session || !session.isAuthenticated || !session.token) {
        throw new Error('User not authenticated');
      }
      
      apiService.setToken(session.token);
      
      const response = await apiService.get<ApiResponse<any>>('/api/auth/me');
      
      if (!response.data) {
        throw new Error('Failed to fetch profile');
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Error fetching profile:', error);
      
      // Handle token expiration
      if (error.status === 401 || (error.response && error.response.status === 401)) {
        this.logout(chatId);
      }
      
      return null;
    }
  }

  // Get KYC status
  public async getKycStatus(chatId: number): Promise<any | null> {
    try {
      const session = this.sessions[chatId];
      
      if (!session || !session.isAuthenticated || !session.token) {
        throw new Error('User not authenticated');
      }
      
      apiService.setToken(session.token);
      
      const response = await apiService.get<ApiResponse<any>>('/api/kycs');
      
      if (!response.data) {
        throw new Error('Failed to fetch KYC status');
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Error fetching KYC status:', error);
      
      // Handle token expiration
      if (error.status === 401 || (error.response && error.response.status === 401)) {
        this.logout(chatId);
      }
      
      return null;
    }
  }

  // Logout user
  public logout(chatId: number): void {
    // Notify notification service before removing the session
    if (this.sessions[chatId]?.organizationId) {
      notificationService.removeUserFromMapping(chatId);
    }
    
    // Clear session
    delete this.sessions[chatId];
  }
}

export default new AuthService(); 
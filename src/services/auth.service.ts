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
      console.log(`[AUTH] Requesting OTP for email: ${email}, chatId: ${chatId}`);
      
      // First, check if the API is reachable
      console.log('[AUTH] Checking if API is reachable...');
      const isApiReachable = await apiService.isReachable();
      if (!isApiReachable) {
        console.error('[AUTH] API is not reachable');
        return false;
      }
      
      console.log('[AUTH] API is reachable, proceeding with OTP request');
      
      console.log('[AUTH] Making POST request to /api/auth/email-otp/request');
      const response = await apiService.post<ApiResponse<{ requestId: string }>>('/api/auth/email-otp/request', { email });
      
      console.log('[AUTH] OTP request response:', JSON.stringify(response, null, 2));
      
      if (!response || !response.data || !response.data.requestId) {
        console.error('[AUTH] Invalid OTP request response:', response);
        throw new Error('Invalid response from server');
      }
      
      // Store email and requestId in session
      console.log(`[AUTH] Storing session data for chatId: ${chatId} with requestId: ${response.data.requestId}`);
      this.sessions[chatId] = {
        email,
        requestId: response.data.requestId,
        isAuthenticated: false
      };
      
      console.log(`[AUTH] OTP requested successfully. Request ID: ${response.data.requestId}`);
      return true;
    } catch (error: any) {
      console.error('[AUTH] Error requesting OTP:', error);
      
      // Log additional details for debugging
      console.error('[AUTH] Error stack:', error.stack);
      
      if (error.status) {
        console.error('[AUTH] Error status:', error.status);
      }
      if (error.data) {
        console.error('[AUTH] Error data:', error.data);
      }
      if (error.response) {
        console.error('[AUTH] Error response:', error.response.data);
      }
      if (error.message) {
        console.error('[AUTH] Error message:', error.message);
      }
      
      return false;
    }
  }

  // Authenticate with OTP
  public async authenticateWithOTP(otp: string, chatId: number): Promise<{ email: string } | null> {
    try {
      console.log(`[AUTH] Authenticating with OTP for chatId: ${chatId}`);
      
      const session = this.sessions[chatId];
      
      if (!session || !session.email || !session.requestId) {
        console.error('[AUTH] No active login session found');
        throw new Error('No active login session');
      }
      
      console.log(`[AUTH] Found session: Email: ${session.email}, RequestId: ${session.requestId}`);
      
      const response = await apiService.post<ApiResponse<{ token: string; organizationId: string }>>('/api/auth/email-otp/authenticate', {
        email: session.email,
        otp,
        requestId: session.requestId
      });
      
      console.log('[AUTH] Authentication response:', JSON.stringify(response, null, 2));
      
      if (!response.data || !response.data.token) {
        console.error('[AUTH] Authentication failed - invalid response');
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
        console.log(`[AUTH] Registering with notification service. OrganizationId: ${response.data.organizationId}`);
        notificationService.addUserToMapping(chatId, response.data.organizationId, response.data.token);
      }
      
      console.log(`[AUTH] Authentication successful for ${session.email}`);
      return { email: session.email };
    } catch (error: any) {
      console.error('[AUTH] Error authenticating with OTP:', error);
      
      // Log additional details for debugging
      if (error.status) {
        console.error('[AUTH] Error status:', error.status);
      }
      if (error.data) {
        console.error('[AUTH] Error data:', error.data);
      }
      
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
import apiService from './api.service';
import { LoginResponse, ApiResponse, ProfileResponse, KycResponse } from '../interfaces/api.interface';
import { User, UserSession, OTPRequest } from '../interfaces/user.interface';

class AuthService {
  private sessions: Map<number, UserSession> = new Map(); // Map Telegram chatId to user session
  private otpRequests: Map<number, OTPRequest> = new Map(); // Store active OTP requests

  // Request OTP for login
  public async requestOTP(email: string, chatId: number): Promise<boolean> {
    try {
      await apiService.post<ApiResponse<any>>('/api/auth/email-otp/request', { email });
      
      // Store the OTP request for verification later
      this.otpRequests.set(chatId, { email, chatId });
      
      return true;
    } catch (error) {
      console.error('Error requesting OTP:', error);
      return false;
    }
  }

  // Authenticate with OTP
  public async authenticateWithOTP(otp: string, chatId: number): Promise<User | null> {
    try {
      const otpRequest = this.otpRequests.get(chatId);
      
      if (!otpRequest) {
        throw new Error('No active OTP request found');
      }
      
      const response = await apiService.post<ApiResponse<LoginResponse>>('/api/auth/email-otp/authenticate', {
        email: otpRequest.email,
        otp
      });
      
      if (!response.data || !response.data.token) {
        throw new Error('Authentication failed');
      }
      
      const { token, user } = response.data;
      
      // Set the token for future API requests
      apiService.setToken(token);
      
      // Create user session
      const userSession: UserSession = {
        userId: user.id,
        token,
        email: user.email,
        organizationId: user.organization.id,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
      };
      
      // Store the session
      this.sessions.set(chatId, userSession);
      
      // Clean up the OTP request
      this.otpRequests.delete(chatId);
      
      return {
        id: user.id,
        email: user.email,
        token,
        organizationId: user.organization.id,
        chatId
      };
    } catch (error) {
      console.error('Error authenticating with OTP:', error);
      return null;
    }
  }

  // Get user session by chatId
  public getSession(chatId: number): UserSession | undefined {
    return this.sessions.get(chatId);
  }

  // Check if a user is authenticated
  public isAuthenticated(chatId: number): boolean {
    const session = this.sessions.get(chatId);
    
    if (!session) {
      return false;
    }
    
    // Check if the session has expired
    if (session.expires < new Date()) {
      this.logout(chatId);
      return false;
    }
    
    return true;
  }

  // Fetch user profile
  public async getProfile(chatId: number): Promise<ProfileResponse | null> {
    try {
      if (!this.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      const session = this.sessions.get(chatId)!;
      apiService.setToken(session.token);
      
      const response = await apiService.get<ApiResponse<ProfileResponse>>('/api/auth/me');
      
      if (!response.data) {
        throw new Error('Failed to get profile');
      }
      
      return response.data;
    } catch (error) {
      console.error('Error getting profile:', error);
      return null;
    }
  }

  // Fetch KYC status
  public async getKycStatus(chatId: number): Promise<KycResponse | null> {
    try {
      if (!this.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      const session = this.sessions.get(chatId)!;
      apiService.setToken(session.token);
      
      const response = await apiService.get<ApiResponse<KycResponse>>('/api/kycs');
      
      if (!response.data) {
        throw new Error('Failed to get KYC status');
      }
      
      return response.data;
    } catch (error) {
      console.error('Error getting KYC status:', error);
      return null;
    }
  }

  // Logout user
  public logout(chatId: number): void {
    this.sessions.delete(chatId);
    apiService.clearToken();
  }
}

export default new AuthService(); 
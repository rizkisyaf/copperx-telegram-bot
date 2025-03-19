export interface User {
  id: string;
  email: string;
  token?: string;
  organizationId?: string;
  chatId?: number; // Telegram chat ID
  kycApproved?: boolean;
}

export interface UserSession {
  userId: string;
  token: string;
  email: string;
  organizationId: string;
  expires: Date;
}

export interface OTPRequest {
  email: string;
  chatId: number;
} 
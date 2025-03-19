import { Context as TelegrafContext } from 'telegraf';
import { BulkRecipient } from './wallet.interface';

// User session data
export interface Session {
  // API error tracking
  lastApiErrorNotification?: number;
  
  // Authentication
  auth?: {
    email?: string;
    token?: string;
    requestId?: string;
    isAuthenticated: boolean;
  };
  
  // Send funds flow
  send?: {
    email?: string;
    amount?: string;
    step: 'init' | 'email' | 'amount' | 'confirm';
    fee?: number;
    totalAmount?: number;
  };
  
  // Withdraw flow
  withdraw?: {
    address?: string;
    network?: string;
    amount?: string;
    step: 'init' | 'network' | 'address' | 'amount' | 'confirm';
    fee?: number;
    totalAmount?: number;
  };
  
  // Bank withdrawal flow
  bank?: {
    accountId?: string;
    amount?: string;
    step: 'init' | 'account' | 'amount' | 'confirm';
    fee?: number;
    totalAmount?: number;
  };
  
  // Bulk transfer flow
  bulkTransfer?: {
    recipients: BulkRecipient[];
    currentStep: 'init' | 'add_email' | 'add_amount' | 'review' | 'confirm';
    currentEmail?: string;
    feeInfo?: {
      totalAmount: number;
      fee: number;
      totalWithFee: number;
      recipientCount: number;
      feePerRecipient: number;
      feePercentage: string;
    };
  };
  
  // Payment link flow
  paymentLink?: {
    amount?: string;
    description?: string;
    expiresIn?: number;
    step: 'init' | 'amount' | 'description' | 'expiry' | 'confirm';
  };
  
  // Address book flow
  addressBook?: {
    label?: string;
    network?: string;
    address?: string;
    step: 'init' | 'label' | 'network' | 'address' | 'confirm';
  };
}

// Extended context with session
export interface Context extends TelegrafContext {
  session: Session;
} 
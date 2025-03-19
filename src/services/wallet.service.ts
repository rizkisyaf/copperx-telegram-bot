import apiService from './api.service';
import authService from './auth.service';
import { ApiResponse } from '../interfaces/api.interface';
import { WalletBalanceResponse, WalletResponse, TransferResponse, TransfersListResponse, BankAccountResponse } from '../interfaces/api.interface';
import { TransferRequest } from '../interfaces/wallet.interface';

// Fee structure (these would be fetched from the API in a real implementation)
const FEES = {
  EMAIL_TRANSFER: 0.1, // $0.10 fee for email transfers
  WALLET_TRANSFER: {
    SOLANA: 0.2,       // $0.20 fee for Solana transfers
    ETHEREUM: 1.5      // $1.50 fee for Ethereum transfers (higher gas fees)
  },
  BANK_TRANSFER: 5.0   // $5.00 fee for bank transfers
};

// Minimum amounts (these would be fetched from the API in a real implementation)
const MIN_AMOUNTS = {
  EMAIL_TRANSFER: 1.0,  // $1 minimum for email transfers
  WALLET_TRANSFER: {
    SOLANA: 5.0,        // $5 minimum for Solana transfers
    ETHEREUM: 20.0      // $20 minimum for Ethereum transfers
  },
  BANK_TRANSFER: 50.0   // $50 minimum for bank transfers
};

class WalletService {
  // Calculate fee for a transaction
  public calculateFee(amount: string, transferType: 'email' | 'wallet' | 'bank', network?: string): number {
    const amountNum = parseFloat(amount);
    
    if (transferType === 'email') {
      return FEES.EMAIL_TRANSFER;
    } else if (transferType === 'wallet' && network) {
      return FEES.WALLET_TRANSFER[network.toUpperCase() as keyof typeof FEES.WALLET_TRANSFER] || FEES.WALLET_TRANSFER.SOLANA;
    } else if (transferType === 'bank') {
      return FEES.BANK_TRANSFER;
    }
    
    return 0;
  }
  
  // Check if amount meets minimum requirements
  public validateMinimumAmount(amount: string, transferType: 'email' | 'wallet' | 'bank', network?: string): { valid: boolean, minimumAmount?: number } {
    const amountNum = parseFloat(amount);
    
    if (transferType === 'email') {
      if (amountNum < MIN_AMOUNTS.EMAIL_TRANSFER) {
        return { valid: false, minimumAmount: MIN_AMOUNTS.EMAIL_TRANSFER };
      }
    } else if (transferType === 'wallet' && network) {
      const minAmount = MIN_AMOUNTS.WALLET_TRANSFER[network.toUpperCase() as keyof typeof MIN_AMOUNTS.WALLET_TRANSFER] || MIN_AMOUNTS.WALLET_TRANSFER.SOLANA;
      if (amountNum < minAmount) {
        return { valid: false, minimumAmount: minAmount };
      }
    } else if (transferType === 'bank') {
      if (amountNum < MIN_AMOUNTS.BANK_TRANSFER) {
        return { valid: false, minimumAmount: MIN_AMOUNTS.BANK_TRANSFER };
      }
    }
    
    return { valid: true };
  }

  // Get wallet balances
  public async getBalances(chatId: number): Promise<WalletBalanceResponse[] | null> {
    try {
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      const session = authService.getSession(chatId)!;
      apiService.setToken(session.token);
      
      const response = await apiService.get<ApiResponse<WalletBalanceResponse[]>>('/api/wallets/balances');
      
      if (!response.data) {
        throw new Error('Failed to get wallet balances');
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Error getting wallet balances:', error);
      return null;
    }
  }

  // Get all wallets
  public async getWallets(chatId: number): Promise<WalletResponse[] | null> {
    try {
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      const session = authService.getSession(chatId)!;
      apiService.setToken(session.token);
      
      const response = await apiService.get<ApiResponse<WalletResponse[]>>('/api/wallets');
      
      if (!response.data) {
        throw new Error('Failed to get wallets');
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Error getting wallets:', error);
      return null;
    }
  }

  // Set default wallet
  public async setDefaultWallet(chatId: number, walletId: string): Promise<boolean> {
    try {
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      const session = authService.getSession(chatId)!;
      apiService.setToken(session.token);
      
      await apiService.post<ApiResponse<any>>('/api/wallets/default', { walletId });
      
      return true;
    } catch (error: any) {
      console.error('Error setting default wallet:', error);
      return false;
    }
  }

  // Check if user has sufficient balance
  public async checkBalance(chatId: number, amount: string): Promise<{ sufficient: boolean, availableBalance?: string }> {
    try {
      const balances = await this.getBalances(chatId);
      
      if (!balances || balances.length === 0) {
        return { sufficient: false, availableBalance: '0' };
      }
      
      // Get default wallet or the first wallet
      const defaultWallet = balances.find(wallet => wallet.isDefault) || balances[0];
      const availableBalance = defaultWallet.balance;
      const amountToSend = parseFloat(amount);
      
      return {
        sufficient: parseFloat(availableBalance) >= amountToSend,
        availableBalance
      };
    } catch (error: any) {
      console.error('Error checking balance:', error);
      return { sufficient: false };
    }
  }

  // Get transaction history
  public async getTransferHistory(chatId: number, page: number = 1, limit: number = 10): Promise<TransfersListResponse | null> {
    try {
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      const session = authService.getSession(chatId)!;
      apiService.setToken(session.token);
      
      const response = await apiService.get<ApiResponse<TransfersListResponse>>(`/api/transfers?page=${page}&limit=${limit}`);
      
      if (!response.data) {
        throw new Error('Failed to get transfer history');
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Error getting transfer history:', error);
      return null;
    }
  }

  // Send funds to email
  public async sendFundsToEmail(chatId: number, email: string, amount: string): Promise<TransferResponse | null> {
    try {
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      // Validate minimum amount
      const validation = this.validateMinimumAmount(amount, 'email');
      if (!validation.valid) {
        throw new Error(`Amount too small. Minimum amount is ${validation.minimumAmount} USDC.`);
      }
      
      // Check if user has sufficient balance
      const balanceCheck = await this.checkBalance(chatId, amount);
      if (!balanceCheck.sufficient) {
        throw new Error(`Insufficient balance. Available: ${balanceCheck.availableBalance || '0'} USDC.`);
      }
      
      const session = authService.getSession(chatId)!;
      apiService.setToken(session.token);
      
      const transferRequest: TransferRequest = {
        email,
        amount
      };
      
      const response = await apiService.post<ApiResponse<TransferResponse>>('/api/transfers/send', transferRequest);
      
      if (!response.data) {
        throw new Error('Failed to send funds');
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Error sending funds to email:', error);
      return null;
    }
  }

  // Send funds to external wallet
  public async sendFundsToWallet(chatId: number, address: string, network: string, amount: string): Promise<TransferResponse | null> {
    try {
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      // Validate network
      const normalizedNetwork = network.toUpperCase();
      if (!['SOLANA', 'ETHEREUM'].includes(normalizedNetwork)) {
        throw new Error('Unsupported network. Please choose Solana or Ethereum.');
      }
      
      // Validate address format based on network
      if (normalizedNetwork === 'SOLANA' && !address.match(/^[A-HJ-NP-Za-km-z1-9]{32,44}$/)) {
        throw new Error('Invalid Solana address format.');
      } else if (normalizedNetwork === 'ETHEREUM' && !address.match(/^0x[a-fA-F0-9]{40}$/)) {
        throw new Error('Invalid Ethereum address format.');
      }
      
      // Validate minimum amount
      const validation = this.validateMinimumAmount(amount, 'wallet', normalizedNetwork);
      if (!validation.valid) {
        throw new Error(`Amount too small. Minimum amount for ${normalizedNetwork} is ${validation.minimumAmount} USDC.`);
      }
      
      // Check if user has sufficient balance (including fee)
      const fee = this.calculateFee(amount, 'wallet', normalizedNetwork);
      const totalAmount = parseFloat(amount) + fee;
      const balanceCheck = await this.checkBalance(chatId, totalAmount.toString());
      
      if (!balanceCheck.sufficient) {
        throw new Error(`Insufficient balance. Available: ${balanceCheck.availableBalance || '0'} USDC. Required: ${totalAmount} USDC (includes ${fee} USDC fee).`);
      }
      
      const session = authService.getSession(chatId)!;
      apiService.setToken(session.token);
      
      const transferRequest: TransferRequest = {
        address,
        network,
        amount
      };
      
      const response = await apiService.post<ApiResponse<TransferResponse>>('/api/transfers/wallet-withdraw', transferRequest);
      
      if (!response.data) {
        throw new Error('Failed to send funds to wallet');
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Error sending funds to wallet:', error);
      return null;
    }
  }

  // Withdraw funds to bank
  public async withdrawToBank(chatId: number, bankAccountId: string, amount: string): Promise<TransferResponse | null> {
    try {
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      // Validate minimum amount
      const validation = this.validateMinimumAmount(amount, 'bank');
      if (!validation.valid) {
        throw new Error(`Amount too small. Minimum bank withdrawal is ${validation.minimumAmount} USDC.`);
      }
      
      // Check if user has sufficient balance (including fee)
      const fee = this.calculateFee(amount, 'bank');
      const totalAmount = parseFloat(amount) + fee;
      const balanceCheck = await this.checkBalance(chatId, totalAmount.toString());
      
      if (!balanceCheck.sufficient) {
        throw new Error(`Insufficient balance. Available: ${balanceCheck.availableBalance || '0'} USDC. Required: ${totalAmount} USDC (includes ${fee} USDC fee).`);
      }
      
      const session = authService.getSession(chatId)!;
      apiService.setToken(session.token);
      
      const transferRequest: TransferRequest = {
        bank_account_id: bankAccountId,
        amount
      };
      
      const response = await apiService.post<ApiResponse<TransferResponse>>('/api/transfers/offramp', transferRequest);
      
      if (!response.data) {
        throw new Error('Failed to withdraw funds to bank');
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Error withdrawing funds to bank:', error);
      return null;
    }
  }
  
  // Get transaction fee information for display
  public getTransactionFeeInfo(amount: string, transferType: 'email' | 'wallet' | 'bank', network?: string): { 
    fee: number, 
    totalAmount: number,
    feePercentage: string,
    minimumAmount: number 
  } {
    const amountNum = parseFloat(amount);
    let fee = 0;
    let minimumAmount = 0;
    
    if (transferType === 'email') {
      fee = FEES.EMAIL_TRANSFER;
      minimumAmount = MIN_AMOUNTS.EMAIL_TRANSFER;
    } else if (transferType === 'wallet' && network) {
      const normalizedNetwork = network.toUpperCase() as keyof typeof FEES.WALLET_TRANSFER;
      fee = FEES.WALLET_TRANSFER[normalizedNetwork] || FEES.WALLET_TRANSFER.SOLANA;
      minimumAmount = MIN_AMOUNTS.WALLET_TRANSFER[normalizedNetwork] || MIN_AMOUNTS.WALLET_TRANSFER.SOLANA;
    } else if (transferType === 'bank') {
      fee = FEES.BANK_TRANSFER;
      minimumAmount = MIN_AMOUNTS.BANK_TRANSFER;
    }
    
    const totalAmount = amountNum + fee;
    const feePercentage = ((fee / amountNum) * 100).toFixed(2);
    
    return {
      fee,
      totalAmount,
      feePercentage,
      minimumAmount
    };
  }

  // Get linked bank accounts
  public async getBankAccounts(chatId: number): Promise<BankAccountResponse[] | null> {
    try {
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      const session = authService.getSession(chatId)!;
      apiService.setToken(session.token);
      
      const response = await apiService.get<ApiResponse<BankAccountResponse[]>>('/api/bank-accounts');
      
      if (!response.data) {
        throw new Error('Failed to get bank accounts');
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Error getting bank accounts:', error);
      return null;
    }
  }
}

export default new WalletService(); 
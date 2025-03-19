import apiService from './api.service';
import authService from './auth.service';
import feeService from './fee.service';
import { ApiResponse } from '../interfaces/api.interface';
import { WalletBalanceResponse, WalletResponse, TransferResponse, TransfersListResponse, BankAccountResponse } from '../interfaces/api.interface';
import { TransferRequest } from '../interfaces/wallet.interface';

class WalletService {
  // Calculate fee for a transaction
  public async calculateFee(amount: string, transferType: 'email' | 'wallet' | 'bank', network?: string, chatId?: number): Promise<number> {
    const feeCalculation = await feeService.calculateFee(amount, transferType, network, chatId);
    return feeCalculation.fee;
  }
  
  // Check if amount meets minimum requirements
  public async validateMinimumAmount(amount: string, transferType: 'email' | 'wallet' | 'bank', network?: string): Promise<{ valid: boolean, minimumAmount?: number }> {
    return feeService.validateMinimumAmount(amount, transferType, network);
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
  public async checkBalance(chatId: number, amount: string, includesFee: boolean = false): Promise<{ sufficient: boolean, availableBalance?: string }> {
    try {
      const balances = await this.getBalances(chatId);
      
      if (!balances || balances.length === 0) {
        return { sufficient: false, availableBalance: '0' };
      }
      
      // Get default wallet or the first wallet
      const defaultWallet = balances.find(wallet => wallet.isDefault) || balances[0];
      const availableBalance = defaultWallet.balance;
      const amountToCheck = includesFee ? parseFloat(amount) : parseFloat(amount);
      
      return {
        sufficient: parseFloat(availableBalance) >= amountToCheck,
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
      const validation = await this.validateMinimumAmount(amount, 'email');
      if (!validation.valid) {
        throw new Error(`Amount too small. Minimum amount is ${validation.minimumAmount} USDC.`);
      }
      
      // Calculate fee
      const fee = await this.calculateFee(amount, 'email', undefined, chatId);
      const totalAmount = parseFloat(amount) + fee;
      
      // Check if user has sufficient balance including fee
      const balanceCheck = await this.checkBalance(chatId, totalAmount.toString(), true);
      if (!balanceCheck.sufficient) {
        throw new Error(`Insufficient balance. Available: ${balanceCheck.availableBalance || '0'} USDC. Required: ${totalAmount.toFixed(2)} USDC (includes ${fee.toFixed(2)} USDC fee).`);
      }
      
      const session = authService.getSession(chatId)!;
      apiService.setToken(session.token);
      
      const transferRequest: TransferRequest = {
        email,
        amount,
        includeFee: true // Flag to indicate API should handle fee calculation
      };
      
      const response = await apiService.post<ApiResponse<TransferResponse>>('/api/transfers/send', transferRequest);
      
      if (!response.data) {
        throw new Error('Failed to send funds');
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Error sending funds to email:', error);
      throw error; // Rethrow to allow for specific error handling in the caller
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
      const validation = await this.validateMinimumAmount(amount, 'wallet', normalizedNetwork);
      if (!validation.valid) {
        throw new Error(`Amount too small. Minimum amount for ${normalizedNetwork} is ${validation.minimumAmount} USDC.`);
      }
      
      // Calculate fee
      const fee = await this.calculateFee(amount, 'wallet', normalizedNetwork, chatId);
      const totalAmount = parseFloat(amount) + fee;
      
      // Check if user has sufficient balance (including fee)
      const balanceCheck = await this.checkBalance(chatId, totalAmount.toString(), true);
      
      if (!balanceCheck.sufficient) {
        throw new Error(`Insufficient balance. Available: ${balanceCheck.availableBalance || '0'} USDC. Required: ${totalAmount.toFixed(2)} USDC (includes ${fee.toFixed(2)} USDC fee).`);
      }
      
      const session = authService.getSession(chatId)!;
      apiService.setToken(session.token);
      
      const transferRequest: TransferRequest = {
        address,
        network,
        amount,
        includeFee: true // Flag to indicate API should handle fee calculation
      };
      
      const response = await apiService.post<ApiResponse<TransferResponse>>('/api/transfers/wallet-withdraw', transferRequest);
      
      if (!response.data) {
        throw new Error('Failed to send funds to wallet');
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Error sending funds to wallet:', error);
      throw error; // Rethrow to allow for specific error handling in the caller
    }
  }

  // Withdraw funds to bank
  public async withdrawToBank(chatId: number, bankAccountId: string, amount: string): Promise<TransferResponse | null> {
    try {
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      // Validate minimum amount
      const validation = await this.validateMinimumAmount(amount, 'bank');
      if (!validation.valid) {
        throw new Error(`Amount too small. Minimum bank withdrawal is ${validation.minimumAmount} USDC.`);
      }
      
      // Calculate fee
      const fee = await this.calculateFee(amount, 'bank', undefined, chatId);
      const totalAmount = parseFloat(amount) + fee;
      
      // Check if user has sufficient balance (including fee)
      const balanceCheck = await this.checkBalance(chatId, totalAmount.toString(), true);
      
      if (!balanceCheck.sufficient) {
        throw new Error(`Insufficient balance. Available: ${balanceCheck.availableBalance || '0'} USDC. Required: ${totalAmount.toFixed(2)} USDC (includes ${fee.toFixed(2)} USDC fee).`);
      }
      
      const session = authService.getSession(chatId)!;
      apiService.setToken(session.token);
      
      const transferRequest: TransferRequest = {
        bank_account_id: bankAccountId,
        amount,
        includeFee: true // Flag to indicate API should handle fee calculation
      };
      
      const response = await apiService.post<ApiResponse<TransferResponse>>('/api/transfers/offramp', transferRequest);
      
      if (!response.data) {
        throw new Error('Failed to withdraw funds to bank');
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Error withdrawing funds to bank:', error);
      throw error; // Rethrow to allow for specific error handling in the caller
    }
  }
  
  // Get transaction fee information for display
  public async getTransactionFeeInfo(amount: string, transferType: 'email' | 'wallet' | 'bank', network?: string, chatId?: number): Promise<{ 
    fee: number, 
    totalAmount: number,
    feePercentage: string,
    minimumAmount: number 
  }> {
    const feeCalculation = await feeService.calculateFee(amount, transferType, network, chatId);
    const amountNum = parseFloat(amount);
    
    const minimumAmountValidation = await this.validateMinimumAmount(amount, transferType, network);
    const minimumAmount = minimumAmountValidation.minimumAmount || 0;
    
    return {
      fee: feeCalculation.fee,
      totalAmount: feeCalculation.totalAmount,
      feePercentage: feeCalculation.feePercentage.toFixed(2),
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
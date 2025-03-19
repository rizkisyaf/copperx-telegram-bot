import apiService from './api.service';
import authService from './auth.service';
import { ApiResponse } from '../interfaces/api.interface';
import { WalletBalanceResponse, WalletResponse, TransferResponse, TransfersListResponse } from '../interfaces/api.interface';
import { TransferRequest } from '../interfaces/wallet.interface';

class WalletService {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      console.error('Error setting default wallet:', error);
      return false;
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      console.error('Error withdrawing funds to bank:', error);
      return null;
    }
  }
}

export default new WalletService(); 
import apiService from './api.service';
import authService from './auth.service';
import feeService from './fee.service';
import { ApiResponse } from '../interfaces/api.interface';
import { WalletBalanceResponse, WalletResponse, TransferResponse, TransfersListResponse, BankAccountResponse } from '../interfaces/api.interface';
import { TransferRequest, BulkTransferRequest, BulkRecipient } from '../interfaces/wallet.interface';

// Supported networks (should be fetched from API in production)
const SUPPORTED_NETWORKS = ['SOLANA', 'ETHEREUM'];

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

  // Get supported networks from the API
  public async getSupportedNetworks(chatId: number): Promise<string[]> {
    try {
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      const session = authService.getSession(chatId);
      if (!session || !session.token) {
        throw new Error('Invalid session data');
      }
      
      apiService.setToken(session.token);
      
      const response = await apiService.get<ApiResponse<string[]>>('/api/networks');
      
      if (response.data && Array.isArray(response.data)) {
        return response.data;
      }
      
      return SUPPORTED_NETWORKS; // Fallback to hardcoded networks
    } catch (error: any) {
      console.error('Error getting supported networks:', error);
      return SUPPORTED_NETWORKS; // Fallback to hardcoded networks
    }
  }
  
  // Validate network
  public async validateNetwork(network: string, chatId?: number): Promise<boolean> {
    const networkUpperCase = network.toUpperCase();
    
    if (chatId) {
      const supportedNetworks = await this.getSupportedNetworks(chatId);
      return supportedNetworks.includes(networkUpperCase);
    }
    
    return SUPPORTED_NETWORKS.includes(networkUpperCase);
  }

  // Calculate fee for bulk transfers
  public async calculateBulkFee(totalAmount: string, recipientCount: number, chatId?: number): Promise<number> {
    try {
      if (chatId && authService.isAuthenticated(chatId)) {
        const session = authService.getSession(chatId);
        if (session && session.token) {
          apiService.setToken(session.token);
          
          const response = await apiService.post<ApiResponse<{fee: number}>>('/api/calculate-bulk-fee', {
            amount: totalAmount,
            recipientCount
          });
          
          if (response.data && typeof response.data.fee === 'number') {
            return response.data.fee;
          }
        }
      }
      
      // Fallback calculation if API call fails
      return recipientCount * (await feeService.calculateFee(
        (parseFloat(totalAmount) / recipientCount).toString(), 
        'email',
        undefined,
        chatId
      )).fee;
    } catch (error) {
      console.error('Error calculating bulk fee:', error);
      // Simple fallback - apply email transfer fee per recipient
      const perRecipientFee = (await feeService.getFeeStructure()).EMAIL_TRANSFER;
      return recipientCount * perRecipientFee;
    }
  }

  // Get wallet balances
  public async getBalances(chatId: number): Promise<WalletBalanceResponse[] | null> {
    try {
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      const session = authService.getSession(chatId);
      if (!session || !session.token) {
        throw new Error('Invalid session data');
      }
      
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
      
      const session = authService.getSession(chatId);
      if (!session || !session.token) {
        throw new Error('Invalid session data');
      }
      
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
      
      const session = authService.getSession(chatId);
      if (!session || !session.token) {
        throw new Error('Invalid session data');
      }
      
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
  public async getTransferHistory(chatId: number, page: number = 1, limit: number = 10, type?: string, status?: string): Promise<TransfersListResponse | null> {
    try {
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      const session = authService.getSession(chatId);
      if (!session || !session.token) {
        throw new Error('Invalid session data');
      }
      
      apiService.setToken(session.token);
      
      let url = `/api/transfers?page=${page}&limit=${limit}`;
      if (type) url += `&type=${type}`;
      if (status) url += `&status=${status}`;
      
      const response = await apiService.get<ApiResponse<TransfersListResponse>>(url);
      
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
      
      const session = authService.getSession(chatId);
      if (!session || !session.token) {
        throw new Error('Invalid session data');
      }
      
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

  // Send funds to multiple email addresses (bulk transfer)
  public async sendBulkTransfers(
    chatId: number, 
    recipients: BulkRecipient[]
  ): Promise<TransferResponse[] | null> {
    try {
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      if (recipients.length === 0) {
        throw new Error('No recipients specified for bulk transfer');
      }
      
      // Validate each transfer and calculate total amount
      let totalAmount = 0;
      const validationErrors: string[] = [];
      
      for (const recipient of recipients) {
        // Validate email format
        if (!recipient.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email)) {
          validationErrors.push(`Invalid email format for recipient: ${recipient.email}`);
          continue;
        }
        
        // Validate amount is a number
        const amount = parseFloat(recipient.amount);
        if (isNaN(amount) || amount <= 0) {
          validationErrors.push(`Invalid amount for ${recipient.email}: ${recipient.amount}`);
          continue;
        }
        
        // Validate minimum amount
        const validation = await this.validateMinimumAmount(recipient.amount, 'email');
        if (!validation.valid) {
          validationErrors.push(`Amount too small for ${recipient.email}. Minimum amount is ${validation.minimumAmount} USDC.`);
          continue;
        }
        
        totalAmount += amount;
      }
      
      if (validationErrors.length > 0) {
        throw new Error(`Validation errors in bulk transfer:\n${validationErrors.join('\n')}`);
      }
      
      // Calculate bulk fee
      const bulkFee = await this.calculateBulkFee(totalAmount.toString(), recipients.length, chatId);
      const totalWithFee = totalAmount + bulkFee;
      
      // Check if user has sufficient balance
      const balanceCheck = await this.checkBalance(chatId, totalWithFee.toString(), true);
      if (!balanceCheck.sufficient) {
        throw new Error(`Insufficient balance. Available: ${balanceCheck.availableBalance || '0'} USDC. Required: ${totalWithFee.toFixed(2)} USDC (includes ${bulkFee.toFixed(2)} USDC bulk fee).`);
      }
      
      const session = authService.getSession(chatId);
      if (!session || !session.token) {
        throw new Error('Invalid session data');
      }
      
      apiService.setToken(session.token);
      
      const bulkTransferRequest: BulkTransferRequest = {
        recipients,
        includeFee: true
      };
      
      const response = await apiService.post<ApiResponse<TransferResponse[]>>('/api/transfers/send-batch', bulkTransferRequest);
      
      if (!response.data) {
        throw new Error('Failed to send bulk transfers');
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Error sending bulk transfers:', error);
      throw error;
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
      const isValidNetwork = await this.validateNetwork(normalizedNetwork, chatId);
      if (!isValidNetwork) {
        throw new Error(`Unsupported network: ${network}. Please choose a supported network.`);
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
      
      const session = authService.getSession(chatId);
      if (!session || !session.token) {
        throw new Error('Invalid session data');
      }
      
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
      
      const session = authService.getSession(chatId);
      if (!session || !session.token) {
        throw new Error('Invalid session data');
      }
      
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

  // Get bulk transfer fee information
  public async getBulkTransactionFeeInfo(
    recipients: BulkRecipient[], 
    chatId?: number
  ): Promise<{
    totalAmount: number,
    fee: number,
    totalWithFee: number,
    recipientCount: number,
    feePerRecipient: number,
    feePercentage: string
  }> {
    const totalAmount = recipients.reduce((sum, recipient) => sum + parseFloat(recipient.amount), 0);
    const fee = await this.calculateBulkFee(totalAmount.toString(), recipients.length, chatId);
    
    return {
      totalAmount,
      fee, 
      totalWithFee: totalAmount + fee,
      recipientCount: recipients.length,
      feePerRecipient: fee / recipients.length,
      feePercentage: ((fee / totalAmount) * 100).toFixed(2)
    };
  }

  // Get linked bank accounts
  public async getBankAccounts(chatId: number): Promise<BankAccountResponse[] | null> {
    try {
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      const session = authService.getSession(chatId);
      if (!session || !session.token) {
        throw new Error('Invalid session data');
      }
      
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
  
  // Create a payment link
  public async createPaymentLink(
    chatId: number,
    amount: string,
    description: string,
    expiresIn?: number // in hours
  ): Promise<{link: string; id: string} | null> {
    try {
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      const session = authService.getSession(chatId);
      if (!session || !session.token) {
        throw new Error('Invalid session data');
      }
      
      apiService.setToken(session.token);
      
      const payload = {
        amount,
        description,
        expiresIn: expiresIn || 24 // default 24 hours
      };
      
      const response = await apiService.post<ApiResponse<{link: string; id: string}>>('/api/payment-links', payload);
      
      if (!response.data) {
        throw new Error('Failed to create payment link');
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Error creating payment link:', error);
      return null;
    }
  }

  // Get saved addresses (address book)
  public async getSavedAddresses(chatId: number): Promise<any[] | null> {
    try {
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      const session = authService.getSession(chatId);
      if (!session || !session.token) {
        throw new Error('Invalid session data');
      }
      
      apiService.setToken(session.token);
      
      const response = await apiService.get<ApiResponse<any[]>>('/api/address-book');
      
      if (!response.data) {
        throw new Error('Failed to get saved addresses');
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Error getting saved addresses:', error);
      return null;
    }
  }

  // Save address to address book
  public async saveAddress(
    chatId: number,
    label: string,
    network: string,
    address: string
  ): Promise<boolean> {
    try {
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      // Validate network
      const isValidNetwork = await this.validateNetwork(network, chatId);
      if (!isValidNetwork) {
        throw new Error(`Unsupported network: ${network}`);
      }
      
      const session = authService.getSession(chatId);
      if (!session || !session.token) {
        throw new Error('Invalid session data');
      }
      
      apiService.setToken(session.token);
      
      const payload = {
        label,
        network,
        address
      };
      
      await apiService.post<ApiResponse<any>>('/api/address-book', payload);
      
      return true;
    } catch (error: any) {
      console.error('Error saving address:', error);
      return false;
    }
  }
}

export default new WalletService(); 
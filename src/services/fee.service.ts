import apiService from './api.service';
import authService from './auth.service';
import { ApiResponse } from '../interfaces/api.interface';

// Default fallback values if API calls fail
const DEFAULT_FEES = {
  EMAIL_TRANSFER: 0.1,
  WALLET_TRANSFER: {
    SOLANA: 0.2,
    ETHEREUM: 1.5
  },
  BANK_TRANSFER: 5.0
};

const DEFAULT_MIN_AMOUNTS = {
  EMAIL_TRANSFER: 1.0,
  WALLET_TRANSFER: {
    SOLANA: 5.0,
    ETHEREUM: 20.0
  },
  BANK_TRANSFER: 50.0
};

interface FeeStructure {
  EMAIL_TRANSFER: number;
  WALLET_TRANSFER: {
    SOLANA: number;
    ETHEREUM: number;
    [key: string]: number;
  };
  BANK_TRANSFER: number;
  [key: string]: any;
}

interface MinimumAmounts {
  EMAIL_TRANSFER: number;
  WALLET_TRANSFER: {
    SOLANA: number;
    ETHEREUM: number;
    [key: string]: number;
  };
  BANK_TRANSFER: number;
  [key: string]: any;
}

interface FeeCalculationResponse {
  fee: number;
  totalAmount: number;
  feePercentage: number;
}

class FeeService {
  private feeStructure: FeeStructure | null = null;
  private minimumAmounts: MinimumAmounts | null = null;
  private lastFetched: number = 0;
  private cacheDuration: number = 3600000; // 1 hour cache

  /**
   * Get the current fee structure from the API
   * @param forceRefresh Force a refresh of the cached data
   * @returns The current fee structure
   */
  public async getFeeStructure(forceRefresh = false): Promise<FeeStructure> {
    if (forceRefresh || !this.feeStructure || Date.now() - this.lastFetched > this.cacheDuration) {
      await this.refreshFeeData();
    }
    return this.feeStructure || DEFAULT_FEES;
  }

  /**
   * Get the minimum amount requirements from the API
   * @param forceRefresh Force a refresh of the cached data
   * @returns The current minimum amounts
   */
  public async getMinimumAmounts(forceRefresh = false): Promise<MinimumAmounts> {
    if (forceRefresh || !this.minimumAmounts || Date.now() - this.lastFetched > this.cacheDuration) {
      await this.refreshFeeData();
    }
    return this.minimumAmounts || DEFAULT_MIN_AMOUNTS;
  }

  /**
   * Calculate the fee for a specific transaction using the API
   * @param amount Amount to transfer
   * @param transferType Type of transfer (email, wallet, bank)
   * @param network Network for wallet transfers (SOLANA, ETHEREUM)
   * @param chatId User's chat ID for authentication
   * @returns Fee calculation details
   */
  public async calculateFee(
    amount: string, 
    transferType: 'email' | 'wallet' | 'bank', 
    network?: string,
    chatId?: number
  ): Promise<FeeCalculationResponse> {
    try {
      if (chatId && authService.isAuthenticated(chatId)) {
        const session = authService.getSession(chatId)!;
        
        if (!session.token) {
          throw new Error('Invalid session token');
        }
        
        apiService.setToken(session.token);
        
        // Call the API endpoint to calculate the fee
        // Using the transfers/fee endpoint as per API docs
        const response = await apiService.post<ApiResponse<FeeCalculationResponse>>('/api/transfers/fee', {
          amount,
          type: transferType,
          network: network || undefined
        });
        
        if (response.data) {
          return response.data;
        }
      }
      
      // Fall back to local calculation if API call fails or user not authenticated
      return this.calculateFeeLocally(amount, transferType, network);
    } catch (error) {
      console.error('Error calculating fee from API:', error);
      return this.calculateFeeLocally(amount, transferType, network);
    }
  }

  /**
   * Refresh fee data from the API
   * @private
   */
  private async refreshFeeData(): Promise<void> {
    try {
      // First try to get the fees with authentication if possible
      let feeResponse = null;
      let minimumResponse = null;
      
      try {
        // Try to get fees from the transfers/fees-config endpoint
        feeResponse = await apiService.get<ApiResponse<FeeStructure>>('/api/transfers/fees-config');
        
        // Try to get minimum amounts from the transfers/minimum-amounts endpoint
        minimumResponse = await apiService.get<ApiResponse<MinimumAmounts>>('/api/transfers/minimum-amounts');
      } catch (error) {
        console.warn('Could not fetch fee data from authenticated endpoints:', error);
      }
      
      // If either request succeeded, use the data
      if (feeResponse?.data) {
        this.feeStructure = feeResponse.data;
      }
      
      if (minimumResponse?.data) {
        this.minimumAmounts = minimumResponse.data;
      }
      
      // If both requests succeeded, update lastFetched
      if (feeResponse?.data && minimumResponse?.data) {
        this.lastFetched = Date.now();
        return;
      }
      
      // If we still don't have data, try the public endpoints
      const publicConfig = await apiService.get<ApiResponse<{
        fees: FeeStructure;
        minimumAmounts: MinimumAmounts;
      }>>('/api/config/fee-structure');
      
      if (publicConfig?.data) {
        if (!this.feeStructure && publicConfig.data.fees) {
          this.feeStructure = publicConfig.data.fees;
        }
        
        if (!this.minimumAmounts && publicConfig.data.minimumAmounts) {
          this.minimumAmounts = publicConfig.data.minimumAmounts;
        }
        
        this.lastFetched = Date.now();
      } else {
        throw new Error('Could not fetch fee configuration from API');
      }
    } catch (error) {
      console.error('Error fetching fee data from API:', error);
      // If API call fails, use default values but don't update lastFetched
      // so we'll try again on the next request
      if (!this.feeStructure) this.feeStructure = { ...DEFAULT_FEES };
      if (!this.minimumAmounts) this.minimumAmounts = { ...DEFAULT_MIN_AMOUNTS };
    }
  }

  /**
   * Calculate fee locally as a fallback
   * @param amount Amount to transfer
   * @param transferType Type of transfer
   * @param network Network for wallet transfers
   * @returns Fee calculation details
   * @private
   */
  private async calculateFeeLocally(
    amount: string, 
    transferType: 'email' | 'wallet' | 'bank', 
    network?: string
  ): Promise<FeeCalculationResponse> {
    const amountNum = parseFloat(amount);
    const fees = await this.getFeeStructure();
    let fee = 0;
    
    if (transferType === 'email') {
      fee = fees.EMAIL_TRANSFER;
    } else if (transferType === 'wallet' && network) {
      const normalizedNetwork = network.toUpperCase() as keyof typeof fees.WALLET_TRANSFER;
      fee = fees.WALLET_TRANSFER[normalizedNetwork] || fees.WALLET_TRANSFER.SOLANA;
    } else if (transferType === 'bank') {
      fee = fees.BANK_TRANSFER;
    }
    
    const totalAmount = amountNum + fee;
    const feePercentage = (fee / amountNum) * 100;
    
    return {
      fee,
      totalAmount,
      feePercentage
    };
  }

  /**
   * Validate if amount meets minimum requirements
   * @param amount Amount to check
   * @param transferType Type of transfer
   * @param network Network for wallet transfers
   * @returns Validation result and minimum amount if invalid
   */
  public async validateMinimumAmount(
    amount: string, 
    transferType: 'email' | 'wallet' | 'bank', 
    network?: string
  ): Promise<{ valid: boolean, minimumAmount?: number }> {
    const amountNum = parseFloat(amount);
    const minimums = await this.getMinimumAmounts();
    
    if (transferType === 'email') {
      if (amountNum < minimums.EMAIL_TRANSFER) {
        return { valid: false, minimumAmount: minimums.EMAIL_TRANSFER };
      }
    } else if (transferType === 'wallet' && network) {
      const normalizedNetwork = network.toUpperCase() as keyof typeof minimums.WALLET_TRANSFER;
      const minAmount = minimums.WALLET_TRANSFER[normalizedNetwork] || minimums.WALLET_TRANSFER.SOLANA;
      if (amountNum < minAmount) {
        return { valid: false, minimumAmount: minAmount };
      }
    } else if (transferType === 'bank') {
      if (amountNum < minimums.BANK_TRANSFER) {
        return { valid: false, minimumAmount: minimums.BANK_TRANSFER };
      }
    }
    
    return { valid: true };
  }
}

export default new FeeService(); 
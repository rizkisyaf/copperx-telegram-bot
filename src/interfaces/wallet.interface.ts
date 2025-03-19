export interface Wallet {
  id: string;
  address: string;
  network: string;
  isDefault: boolean;
  balance?: string;
}

export interface WalletBalance {
  id: string;
  network: string;
  address: string;
  balance: string;
  isDefault: boolean;
}

export interface Transfer {
  id: string;
  amount: string;
  status: string;
  type: string;
  recipient?: string;
  created_at: string;
  updated_at: string;
}

export interface TransferRequest {
  email?: string;
  amount: string;
  address?: string;
  network?: string;
  bank_account_id?: string;
} 
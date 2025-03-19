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
  includeFee?: boolean;
}

export interface BulkRecipient {
  email: string;
  amount: string;
  memo?: string;
}

export interface BulkTransferRequest {
  recipients: BulkRecipient[];
  includeFee?: boolean;
}

export interface AddressBookEntry {
  id: string;
  label: string;
  network: string;
  address: string;
  created_at: string;
}

export interface PaymentLink {
  id: string;
  amount: string;
  description: string;
  link: string;
  expires_at: string;
  created_at: string;
  status: string;
} 
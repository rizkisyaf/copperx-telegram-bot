export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    organization: {
      id: string;
      name: string;
    };
  };
}

export interface KycResponse {
  id: string;
  status: string;
  type: string;
  created_at: string;
  updated_at: string;
}

export interface ProfileResponse {
  id: string;
  email: string;
  organization: {
    id: string;
    name: string;
  };
}

export interface WalletResponse {
  id: string;
  address: string;
  network: string;
  isDefault: boolean;
}

export interface WalletBalanceResponse {
  id: string;
  address: string;
  network: string;
  balance: string;
  isDefault: boolean;
}

export interface TransferResponse {
  id: string;
  amount: string;
  status: string;
  type: string;
  recipient?: string;
  created_at: string;
  updated_at: string;
}

export interface TransfersListResponse {
  data: TransferResponse[];
  total: number;
  page: number;
  limit: number;
} 
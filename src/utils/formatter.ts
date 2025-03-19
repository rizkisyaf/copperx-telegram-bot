import { WalletBalanceResponse, TransferResponse } from '../interfaces/api.interface';

export const formatBalance = (balance: string): string => {
  const amount = parseFloat(balance);
  return amount.toFixed(2);
};

export const formatWalletBalances = (balances: WalletBalanceResponse[]): string => {
  if (!balances || balances.length === 0) {
    return 'No wallets found.';
  }

  return balances
    .map((wallet) => {
      const formattedBalance = formatBalance(wallet.balance);
      const defaultTag = wallet.isDefault ? ' (Default)' : '';
      return `${wallet.network}${defaultTag}: ${formattedBalance} USDC\nAddress: ${wallet.address.substring(0, 10)}...${wallet.address.substring(wallet.address.length - 5)}`;
    })
    .join('\n\n');
};

export const formatTransfer = (transfer: TransferResponse): string => {
  const date = new Date(transfer.created_at).toLocaleDateString();
  const time = new Date(transfer.created_at).toLocaleTimeString();
  
  let details = `Type: ${transfer.type}\n`;
  details += `Amount: ${formatBalance(transfer.amount)} USDC\n`;
  details += `Status: ${transfer.status}\n`;
  details += `Date: ${date} ${time}\n`;
  
  if (transfer.recipient) {
    details += `Recipient: ${transfer.recipient}\n`;
  }
  
  return details;
};

export const formatTransferHistory = (transfers: TransferResponse[]): string => {
  if (!transfers || transfers.length === 0) {
    return 'No transaction history found.';
  }

  return transfers
    .map((transfer, index) => {
      return `Transaction ${index + 1}:\n${formatTransfer(transfer)}`;
    })
    .join('\n\n');
};

export const formatKycStatus = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'verified':
    case 'approved':
      return '✅ Verified';
    case 'pending':
      return '⏳ Pending';
    case 'rejected':
      return '❌ Rejected';
    default:
      return '❓ Not Submitted';
  }
};

export const formatConfirmationMessage = (context: any): string => {
  let message = '📝 *Transaction Confirmation*\n\n';
  
  if (context.recipientEmail) {
    message += `Recipient: ${context.recipientEmail}\n`;
  }
  
  if (context.walletAddress) {
    message += `Wallet: ${context.walletAddress}\n`;
    message += `Network: ${context.network}\n`;
  }
  
  if (context.bankAccountId) {
    message += `Bank Account: ${context.bankAccountId}\n`;
  }
  
  message += `Amount: ${context.amount} USDC\n\n`;
  message += 'Please confirm this transaction:';
  
  return message;
}; 
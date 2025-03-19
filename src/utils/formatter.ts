import { WalletBalanceResponse, TransferResponse } from '../interfaces/api.interface';

export const formatBalance = (balance: string): string => {
  const amount = parseFloat(balance);
  return amount.toFixed(2);
};

export const formatCurrency = (amount: string | number): string => {
  // Convert to number if it's a string
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return numericAmount.toFixed(2);
};

export const formatWalletBalances = (balances: WalletBalanceResponse[]): string => {
  if (!balances || balances.length === 0) {
    return 'No wallets found.';
  }

  return balances
    .map((wallet) => {
      const formattedBalance = formatBalance(wallet.balance);
      const defaultTag = wallet.isDefault ? ' (Default)' : '';
      return `${wallet.network}${defaultTag}: ${formattedBalance} USDC\nAddress: ${formatWalletAddress(wallet.address)}`;
    })
    .join('\n\n');
};

export const formatWalletAddress = (address: string): string => {
  if (!address) return 'N/A';
  
  if (address.length <= 15) return address;
  
  return `${address.substring(0, 10)}...${address.substring(address.length - 5)}`;
};

export const formatTransfer = (transfer: TransferResponse): string => {
  const date = new Date(transfer.created_at).toLocaleDateString();
  const time = new Date(transfer.created_at).toLocaleTimeString();
  
  let details = `Type: ${formatTransferType(transfer.type)}\n`;
  details += `Amount: ${formatBalance(transfer.amount)} USDC\n`;
  details += `Status: ${formatTransferStatus(transfer.status)}\n`;
  details += `Date: ${date} ${time}\n`;
  
  if (transfer.recipient) {
    details += `Recipient: ${transfer.recipient}\n`;
  }
  
  return details;
};

export const formatTransferType = (type: string): string => {
  switch (type.toLowerCase()) {
    case 'send':
      return '📤 Send';
    case 'receive':
      return '📥 Receive';
    case 'withdraw':
      return '🏦 Withdraw';
    case 'deposit':
      return '💰 Deposit';
    default:
      return type;
  }
};

export const formatTransferStatus = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'completed':
    case 'success':
      return '✅ Completed';
    case 'pending':
      return '⏳ Pending';
    case 'failed':
      return '❌ Failed';
    default:
      return status;
  }
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
    message += `Wallet: ${formatWalletAddress(context.walletAddress)}\n`;
    message += `Network: ${context.network}\n`;
  }
  
  if (context.bankAccountId) {
    message += `Bank Account: ${context.bankAccountId}\n`;
  }
  
  message += `Amount: ${context.amount} USDC\n`;
  
  if (context.fee) {
    message += `Fee: ${formatCurrency(context.fee)} USDC\n`;
    message += `Total: ${formatCurrency(parseFloat(context.amount) + context.fee)} USDC\n`;
  }
  
  message += '\nPlease confirm this transaction:';
  
  return message;
};

export const formatTransactionFee = (
  amount: string, 
  fee: number, 
  totalAmount: number, 
  feePercentage: string
): string => {
  let message = '*Transaction Fee Information*\n\n';
  message += `Amount: ${formatCurrency(parseFloat(amount))} USDC\n`;
  message += `Fee: ${formatCurrency(fee)} USDC (${feePercentage}%)\n`;
  message += `Total: ${formatCurrency(totalAmount)} USDC\n`;
  
  return message;
}; 
import { Middleware } from 'telegraf';
import { Context } from '../interfaces/context.interface';
import authService from '../services/auth.service';
import walletService from '../services/wallet.service';
import notificationService from '../services/notification.service';
import conversationManager, { ConversationState } from '../utils/conversation';
import { sendReply } from '../utils/telegram';

/**
 * Handler for setting default wallet
 */
export const defaultWalletActionHandler: Middleware<Context> = async (ctx, next) => {
  // Check if this is a callback query and has data
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    return next();
  }
  
  const callbackData = (ctx.callbackQuery as any).data as string;
  
  // Check if the data starts with setdefault_
  if (!callbackData.startsWith('setdefault_')) {
    return next();
  }
  
  console.log('[CALLBACK] Set default wallet action received:', callbackData.substring(11));
  
  try {
    const walletId = callbackData.substring(11);
    const chatId = ctx.chat?.id;
    
    if (!chatId) {
      console.error('[ERROR] No chat ID in callback query');
      await ctx.answerCbQuery('Error processing request');
      return next();
    }
    
    // Answer the callback query first
    await ctx.answerCbQuery();
    
    if (!authService.isAuthenticated(chatId)) {
      await ctx.reply('You are not logged in. Please login first.');
      return next();
    }
    
    await ctx.reply(`Setting wallet as default...`);
    const success = await walletService.setDefaultWallet(chatId, walletId);
    
    if (success) {
      await ctx.reply('Default wallet set successfully!');
    } else {
      await ctx.reply('Failed to set default wallet. Please try again later.');
    }
  } catch (error) {
    console.error('[ERROR] Error setting default wallet:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
  
  return next();
};

/**
 * Handler for deposit address selection
 */
export const depositActionHandler: Middleware<Context> = async (ctx, next) => {
  // Check if this is a callback query and has data
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    return next();
  }
  
  const callbackData = (ctx.callbackQuery as any).data as string;
  
  // Check if the data starts with deposit_
  if (!callbackData.startsWith('deposit_')) {
    return next();
  }
  
  console.log('[CALLBACK] Deposit action received:', callbackData.substring(8));
  
  try {
    const walletId = callbackData.substring(8);
    const chatId = ctx.chat?.id;
    
    if (!chatId) {
      console.error('[ERROR] No chat ID in callback query');
      await ctx.answerCbQuery('Error processing request');
      return next();
    }
    
    // Answer the callback query first
    await ctx.answerCbQuery();
    
    if (!authService.isAuthenticated(chatId)) {
      await ctx.reply('You are not logged in. Please login first.');
      return next();
    }
    
    await ctx.reply('Fetching deposit information...');
    try {
      // Get the wallet details
      const wallets = await walletService.getWallets(chatId);
      if (!wallets || !Array.isArray(wallets)) {
        await ctx.reply('Failed to fetch wallet information. Please try again later.');
        return next();
      }
      
      const wallet = wallets.find(w => w.id === walletId);
      if (!wallet) {
        await ctx.reply('Wallet not found. Please try again later.');
        return next();
      }
      
      const message = 
        `📥 *Deposit Information*\n\n` +
        `*Network:* ${wallet.network}\n` +
        `*Address:* \`${wallet.address}\`\n\n` +
        `Please only send ${wallet.network} compatible tokens to this address. Sending other tokens may result in permanent loss.`;
      
      await ctx.reply(message, { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Back to Menu', callback_data: 'menu_help' }]
          ]
        }
      });
      
      // Subscribe to notifications for this deposit
      await notificationService.subscribeToOrganization(chatId);
      await ctx.reply('You will receive a notification when your deposit is confirmed.');
    } catch (error) {
      console.error('[ERROR] Error handling deposit:', error);
      await ctx.reply('An error occurred. Please try again later.');
    }
  } catch (error) {
    console.error('[ERROR] Error handling deposit:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
  
  return next();
};

/**
 * Handler for send operations
 */
export const sendActionHandler: Middleware<Context> = async (ctx, next) => {
  // Check if this is a callback query and has data
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    return next();
  }
  
  const callbackData = (ctx.callbackQuery as any).data as string;
  
  // Check if the data starts with send_
  if (!callbackData.startsWith('send_')) {
    return next();
  }
  
  console.log('[CALLBACK] Send action received:', callbackData.substring(5));
  
  try {
    const sendType = callbackData.substring(5);
    const chatId = ctx.chat?.id;
    
    if (!chatId) {
      console.error('[ERROR] No chat ID in callback query');
      await ctx.answerCbQuery('Error processing request');
      return next();
    }
    
    // Answer the callback query first
    await ctx.answerCbQuery();
    
    if (!authService.isAuthenticated(chatId)) {
      await ctx.reply('You are not logged in. Please login first.');
      return next();
    }
    
    // First check if the user has a wallet with funds
    const balances = await walletService.getBalances(chatId);
    
    if (!balances || !Array.isArray(balances) || balances.length === 0) {
      await ctx.reply('You don\'t have any wallet balances. Please deposit funds first.');
      return next();
    }
    
    if (sendType === 'email') {
      // Set the state to wait for email input
      conversationManager.setState(chatId, ConversationState.WAITING_FOR_RECIPIENT_EMAIL);
      // Use sendReply here since we're expecting a direct text response
      await sendReply(ctx, 'Please enter the recipient\'s email address:');
    } else if (sendType === 'wallet') {
      // Set the state to wait for wallet address input
      conversationManager.setState(chatId, ConversationState.WAITING_FOR_WALLET_ADDRESS);
      // Use sendReply here since we're expecting a direct text response
      await sendReply(ctx, 'Please enter the recipient\'s wallet address:');
    } else {
      await ctx.reply('Invalid send type. Please try again.');
    }
  } catch (error) {
    console.error('[ERROR] Error handling send action:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
  
  return next();
};

/**
 * Handler for withdraw operations
 */
export const withdrawActionHandler: Middleware<Context> = async (ctx, next) => {
  // Check if this is a callback query and has data
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    return next();
  }
  
  const callbackData = (ctx.callbackQuery as any).data as string;
  
  // Check if the data starts with withdraw_
  if (!callbackData.startsWith('withdraw_')) {
    return next();
  }
  
  console.log('[CALLBACK] Withdraw action received:', callbackData.substring(9));
  
  try {
    const withdrawType = callbackData.substring(9);
    const chatId = ctx.chat?.id;
    
    if (!chatId) {
      console.error('[ERROR] No chat ID in callback query');
      await ctx.answerCbQuery('Error processing request');
      return next();
    }
    
    // Answer the callback query first
    await ctx.answerCbQuery();
    
    if (!authService.isAuthenticated(chatId)) {
      await ctx.reply('You are not logged in. Please login first.');
      return next();
    }
    
    // First check if the user has a wallet with funds
    const balances = await walletService.getBalances(chatId);
    
    if (!balances || !Array.isArray(balances) || balances.length === 0) {
      await ctx.reply('You don\'t have any wallet balances. There are no funds to withdraw.');
      return next();
    }
    
    if (withdrawType === 'bank') {
      // For now, this is a placeholder until bank withdrawal is implemented
      await ctx.reply('Bank withdrawal feature is coming soon. Please check back later.');
    } else if (withdrawType === 'wallet') {
      // Set the state to wait for external wallet address input
      conversationManager.setState(chatId, ConversationState.WAITING_FOR_EXTERNAL_WALLET);
      // Use sendReply here since we're expecting a direct text response
      await sendReply(ctx, 'Please enter the external wallet address where you want to withdraw your funds:');
    } else {
      await ctx.reply('Invalid withdrawal type. Please try again.');
    }
  } catch (error) {
    console.error('[ERROR] Error handling withdraw action:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
  
  return next();
};

/**
 * Handler for confirming and processing transactions
 */
export const confirmTransactionHandler: Middleware<Context> = async (ctx, next) => {
  // Check if this is a callback query and has data
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    return next();
  }
  
  const callbackData = (ctx.callbackQuery as any).data as string;
  
  // Handle transaction confirmations
  if (callbackData === 'confirm_send') {
    console.log('[CALLBACK] Confirm send transaction received');
    await handleSendConfirmation(ctx);
    return next();
  } else if (callbackData === 'cancel_send') {
    console.log('[CALLBACK] Cancel send transaction received');
    await handleCancellation(ctx, 'send');
    return next();
  } else if (callbackData === 'confirm_wallet_send') {
    console.log('[CALLBACK] Confirm wallet send transaction received');
    await handleWalletSendConfirmation(ctx);
    return next();
  } else if (callbackData === 'cancel_wallet_send') {
    console.log('[CALLBACK] Cancel wallet send transaction received');
    await handleCancellation(ctx, 'wallet_send');
    return next();
  } else if (callbackData === 'confirm_withdrawal') {
    console.log('[CALLBACK] Confirm withdrawal transaction received');
    await handleWithdrawalConfirmation(ctx);
    return next();
  } else if (callbackData === 'cancel_withdrawal') {
    console.log('[CALLBACK] Cancel withdrawal transaction received');
    await handleCancellation(ctx, 'withdrawal');
    return next();
  }
  
  return next();
};

/**
 * Handle send confirmation 
 */
async function handleSendConfirmation(ctx: Context): Promise<void> {
  try {
    // Answer the callback query first
    await ctx.answerCbQuery();
    
    const chatId = ctx.chat?.id;
    if (!chatId) {
      console.error('[ERROR] No chat ID in callback query');
      return;
    }
    
    const context = conversationManager.getContext(chatId);
    if (!context || !context.recipientEmail || !context.amount) {
      await ctx.reply('Transaction information is incomplete. Please start over.');
      conversationManager.resetState(chatId);
      return;
    }
    
    // Show processing message
    await ctx.reply(`⏳ Processing transaction to ${context.recipientEmail}...`);
    
    try {
      // Process the transaction
      const result = await walletService.sendFundsToEmail(
        chatId,
        context.recipientEmail,
        context.amount
      );
      
      if (result) {
        await ctx.reply(
          `✅ *Transaction Successful!*\n\n` +
          `*Amount:* ${context.amount} USDC\n` +
          `*To:* ${context.recipientEmail}\n` +
          `*Transaction ID:* ${result.id || 'N/A'}\n\n` +
          `Funds have been sent successfully.`,
          { parse_mode: 'Markdown' }
        );
        
        // Show updated balance if available
        try {
          const balances = await walletService.getBalances(chatId);
          if (balances && balances.length > 0) {
            const totalBalance = balances.reduce((sum, wallet) => {
              // Convert the balance string to a number before adding
              return sum + parseFloat(wallet.balance);
            }, 0);
            
            await ctx.reply(`Your new balance is: ${totalBalance.toFixed(2)} USDC`);
          }
        } catch (error) {
          console.error('[ERROR] Error fetching updated balance:', error);
        }
      } else {
        await ctx.reply(
          `❌ *Transaction Failed*\n\n` +
          `Error: Unknown error\n\n` +
          `Please try again later or contact support if the issue persists.`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error: any) {
      console.error('[ERROR] Error processing send transaction:', error);
      await ctx.reply(`Transaction failed: ${error.message || 'Unknown error'}`);
    }
    
    // Reset conversation state
    conversationManager.resetState(chatId);
    
  } catch (error) {
    console.error('[ERROR] Error handling send confirmation:', error);
    await ctx.reply('An error occurred while processing your transaction. Please try again later.');
  }
}

/**
 * Handle wallet send confirmation 
 */
async function handleWalletSendConfirmation(ctx: Context): Promise<void> {
  try {
    // Answer the callback query first
    await ctx.answerCbQuery();
    
    const chatId = ctx.chat?.id;
    if (!chatId) {
      console.error('[ERROR] No chat ID in callback query');
      return;
    }
    
    const context = conversationManager.getContext(chatId);
    if (!context || !context.walletAddress || !context.amount || !context.network) {
      await ctx.reply('Transaction information is incomplete. Please start over.');
      conversationManager.resetState(chatId);
      return;
    }
    
    // Show processing message
    await ctx.reply(`⏳ Processing transaction to ${context.walletAddress} on ${context.network.toUpperCase()} network...`);
    
    try {
      // Process the transaction
      const result = await walletService.sendFundsToWallet(
        chatId,
        context.walletAddress,
        context.amount,
        context.network
      );
      
      if (result) {
        // Shortened address for display
        const shortenedAddress = context.walletAddress.length > 16 
          ? `${context.walletAddress.substring(0, 8)}...${context.walletAddress.substring(context.walletAddress.length - 8)}`
          : context.walletAddress;
        
        await ctx.reply(
          `✅ *Transaction Successful!*\n\n` +
          `*Amount:* ${context.amount} USDC\n` +
          `*To:* \`${shortenedAddress}\`\n` +
          `*Network:* ${context.network.toUpperCase()}\n` +
          `*Transaction ID:* ${result.id || 'N/A'}\n\n` +
          `Funds have been sent successfully.`,
          { parse_mode: 'Markdown' }
        );
        
        // Show updated balance if available
        try {
          const balances = await walletService.getBalances(chatId);
          if (balances && balances.length > 0) {
            const totalBalance = balances.reduce((sum, wallet) => {
              // Convert the balance string to a number before adding
              return sum + parseFloat(wallet.balance);
            }, 0);
            
            await ctx.reply(`Your new balance is: ${totalBalance.toFixed(2)} USDC`);
          }
        } catch (error) {
          console.error('[ERROR] Error fetching updated balance:', error);
        }
      } else {
        await ctx.reply(
          `❌ *Transaction Failed*\n\n` +
          `Error: Unknown error\n\n` +
          `Please try again later or contact support if the issue persists.`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error: any) {
      console.error('[ERROR] Error processing wallet send transaction:', error);
      await ctx.reply(`Transaction failed: ${error.message || 'Unknown error'}`);
    }
    
    // Reset conversation state
    conversationManager.resetState(chatId);
    
  } catch (error) {
    console.error('[ERROR] Error handling wallet send confirmation:', error);
    await ctx.reply('An error occurred while processing your transaction. Please try again later.');
  }
}

/**
 * Handle withdrawal confirmation
 */
async function handleWithdrawalConfirmation(ctx: Context): Promise<void> {
  try {
    // Answer the callback query first
    await ctx.answerCbQuery();
    
    const chatId = ctx.chat?.id;
    if (!chatId) {
      console.error('[ERROR] No chat ID in callback query');
      return;
    }
    
    const context = conversationManager.getContext(chatId);
    if (!context || !context.externalWalletAddress || !context.amount || !context.network) {
      await ctx.reply('Withdrawal information is incomplete. Please start over.');
      conversationManager.resetState(chatId);
      return;
    }
    
    // Add an extra layer of security warning for external wallet withdrawals
    // Using sendReply here because we expect a text response (CONFIRM or CANCEL)
    await sendReply(
      ctx,
      `⚠️ *FINAL SECURITY CONFIRMATION*\n\n` +
      `You are about to withdraw ${context.amount} USDC to an external wallet address.\n\n` +
      `This action is *IRREVERSIBLE* and funds sent to the wrong address *CANNOT BE RECOVERED*.\n\n` +
      `Please verify once more that this address is correct:\n\n` +
      `\`${context.externalWalletAddress}\`\n\n` +
      `Network: ${context.network}\n\n` +
      `Type "CONFIRM" to proceed with the withdrawal or "CANCEL" to abort.`,
    );
    
    // Set state to wait for final confirmation
    conversationManager.setState(chatId, ConversationState.WAITING_FOR_WITHDRAWAL_FINAL_CONFIRMATION);
    
  } catch (error) {
    console.error('[ERROR] Error handling withdrawal confirmation:', error);
    await ctx.reply('An error occurred while processing your withdrawal. Please try again later.');
    
    const chatId = ctx.chat?.id;
    if (chatId) {
      conversationManager.resetState(chatId);
    }
  }
}

/**
 * Handle transaction cancellation
 */
async function handleCancellation(ctx: Context, type: 'send' | 'wallet_send' | 'withdrawal'): Promise<void> {
  try {
    // Answer the callback query first
    await ctx.answerCbQuery();
    
    const chatId = ctx.chat?.id;
    if (!chatId) {
      console.error('[ERROR] No chat ID in callback query');
      return;
    }
    
    // Reset the conversation state
    conversationManager.resetState(chatId);
    
    // Get appropriate action callback based on the transaction type
    const tryAgainAction = type === 'send' ? 'menu_send' : 
                          type === 'wallet_send' ? 'menu_send' : 
                          'menu_withdraw';
    
    // Get the appropriate transaction name for display
    const transactionName = type === 'send' ? 'Transfer' : 
                           type === 'wallet_send' ? 'Wallet Transfer' : 
                           'Withdrawal';
    
    // Inform the user that the transaction was cancelled
    await ctx.reply(
      `🛑 ${transactionName} cancelled. No funds have been moved.\n\n` +
      `What would you like to do next?`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💰 Check Balance', callback_data: 'menu_balance' },
              { text: '📤 Try Again', callback_data: tryAgainAction }
            ]
          ]
        }
      }
    );
  } catch (error) {
    console.error(`[ERROR] Error handling ${type} cancellation:`, error);
    
    const chatId = ctx.chat?.id;
    if (chatId) {
      conversationManager.resetState(chatId);
    }
    
    await ctx.reply(`Transaction cancelled, but an error occurred. Please try again later.`);
  }
} 
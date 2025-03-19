import { Context } from '../../interfaces/context.interface';
import conversationManager, { ConversationState } from '../../utils/conversation';
import walletService from '../../services/wallet.service';
import { sendReply } from '../../utils/telegram';

/**
 * Handle wallet address input for sending funds to external wallet
 */
export async function handleWalletAddressInput(ctx: Context, text: string, chatId: number): Promise<void> {
  const walletAddress = text.trim();
  
  console.log(`[WALLET] Processing wallet address input: ${walletAddress.substring(0, 8)}...`);
  
  // Validate wallet address format
  if (walletAddress.length < 30 || walletAddress.length > 50) {
    console.log(`[WALLET] Invalid wallet address length: ${walletAddress.length}`);
    await sendReply(ctx, 'Please enter a valid wallet address. Most blockchain addresses are between 30-50 characters long.');
    return;
  }
  
  // Store the wallet address in the conversation context
  console.log(`[WALLET] Valid wallet address format, storing in context`);
  conversationManager.updateContext(chatId, { walletAddress });
  
  // Now ask for the network selection
  console.log(`[WALLET] Setting state to WAITING_FOR_WALLET_NETWORK`);
  conversationManager.setState(chatId, ConversationState.WAITING_FOR_WALLET_NETWORK);
  
  // Prepare network selection keyboard
  const networkKeyboard = {
    inline_keyboard: [
      [
        { text: 'Ethereum', callback_data: 'network_ethereum' },
        { text: 'Solana', callback_data: 'network_solana' }
      ],
      [
        { text: 'Polygon', callback_data: 'network_polygon' },
        { text: 'Avalanche', callback_data: 'network_avalanche' }
      ]
    ]
  };
  
  await ctx.reply(
    '📡 *Select the Network*\n\nChoose the blockchain network for this transfer. Make sure it matches the wallet address you provided.',
    {
      parse_mode: 'Markdown',
      reply_markup: networkKeyboard
    }
  );
}

/**
 * Handle network selection for wallet transfer
 */
export async function handleWalletNetworkSelection(ctx: Context, callbackData: string, chatId: number): Promise<void> {
  // Extract network from callback data 
  const network = callbackData.replace('network_', '');
  
  console.log(`[WALLET] Network selected: ${network}`);
  
  // Store the network in the conversation context
  conversationManager.updateContext(chatId, { network });
  
  // Now ask for the amount
  console.log(`[WALLET] Setting state to WAITING_FOR_WALLET_AMOUNT`);
  conversationManager.setState(chatId, ConversationState.WAITING_FOR_WALLET_AMOUNT);
  
  // Answer the callback query
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }
  
  // Get the wallet address from context
  const context = conversationManager.getContext(chatId);
  
  if (!context.walletAddress) {
    console.log(`[WALLET] Missing wallet address in context, resetting state`);
    await ctx.reply('An error occurred. Please start over with the send command.');
    conversationManager.resetState(chatId);
    return;
  }
  
  // Show network confirmation and ask for amount
  await sendReply(
    ctx,
    `Network selected: *${network.toUpperCase()}*\n\nPlease enter the amount of USDC to send:`
  );
}

/**
 * Handle amount input for wallet transfer
 */
export async function handleWalletAmountInput(ctx: Context, text: string, chatId: number): Promise<void> {
  const amount = text.trim();
  
  console.log(`[WALLET] Processing wallet amount input: ${amount}`);
  
  // Validate amount format
  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    console.log(`[WALLET] Invalid amount: ${amount}`);
    await sendReply(ctx, 'Please enter a valid amount greater than zero. For example: 10.5');
    return;
  }
  
  // Check for reasonable maximum amount
  if (parseFloat(amount) > 10000) {
    console.log(`[WALLET] Amount exceeds reasonable maximum: ${amount}`);
    await sendReply(ctx, 'The amount appears to be unusually high. Please enter an amount less than 10,000 USDC or contact support for assistance with large transfers.');
    return;
  }
  
  // Get context with wallet address and network
  const context = conversationManager.getContext(chatId);
  
  if (!context.walletAddress || !context.network) {
    console.log(`[WALLET] Missing wallet address or network in context`);
    await ctx.reply('An error occurred. Please start over with the send command.');
    conversationManager.resetState(chatId);
    return;
  }
  
  try {
    // Validate minimum amount based on network
    console.log(`[WALLET] Validating minimum amount for network ${context.network}`);
    const validation = await walletService.validateMinimumAmount(amount, 'wallet', context.network);
    
    if (!validation.valid) {
      console.log(`[WALLET] Amount below minimum: ${amount} < ${validation.minimumAmount}`);
      await sendReply(ctx, `Amount is below the minimum required for ${context.network}. Please enter at least ${validation.minimumAmount} USDC.`);
      return;
    }
    
    // Calculate fee
    console.log(`[WALLET] Calculating fee for amount ${amount}, network ${context.network}`);
    const fee = await walletService.calculateFee(amount, 'wallet', context.network);
    const totalAmount = parseFloat(amount) + fee;
    
    console.log(`[WALLET] Fee calculated: ${fee} USDC, Total: ${totalAmount} USDC`);
    
    // Update context with amount
    conversationManager.updateContext(chatId, { amount });
    
    // Prepare confirmation message
    const isHighValue = parseFloat(amount) > 100;
    
    // Format the wallet address for display (first 6 chars + ... + last 4 chars)
    const displayAddress = `${context.walletAddress.substring(0, 6)}...${context.walletAddress.substring(context.walletAddress.length - 4)}`;
    
    const confirmMessage = 
      `📤 *Wallet Transfer Confirmation*\n\n` +
      `*To Address:* \`${displayAddress}\`\n` +
      `*Network:* ${context.network.toUpperCase()}\n` +
      `*Amount:* ${amount} USDC\n` +
      `*Fee:* ${fee.toFixed(2)} USDC\n` +
      `*Total:* ${totalAmount.toFixed(2)} USDC\n` +
      (isHighValue ? `\n⚠️ *SECURITY NOTICE*: This is a high-value transaction.\n• Double-check the wallet address!\n• Verify the network is correct!\n• Transfers are irreversible!\n` : '') +
      `\nAre you sure you want to proceed?`;
    
    // Different confirmation buttons based on transaction value
    const confirmKeyboard = isHighValue ? 
      {
        inline_keyboard: [
          [
            { text: "✅ Yes, I've verified the details", callback_data: "confirm_wallet_send" }
          ],
          [
            { text: "❌ Cancel Transaction", callback_data: "cancel_wallet_send" }
          ]
        ]
      } :
      {
         inline_keyboard: [
           [
             { text: "✅ Confirm", callback_data: "confirm_wallet_send" },
             { text: "❌ Cancel", callback_data: "cancel_wallet_send" }
           ]
         ]
      };
    
    // Send confirmation message - use ctx.reply since we expect button response, not text
    await ctx.reply(confirmMessage, {
      parse_mode: 'Markdown',
      reply_markup: confirmKeyboard
    });
    
    // Additional warnings for high-value transactions
    if (isHighValue) {
      console.log(`[WALLET] Sending additional security reminder for high-value transaction`);
      await ctx.reply(
        '🔒 *IMPORTANT SECURITY NOTICE*\n\n' +
        'Cryptocurrency transactions to external wallets:\n' +
        '• Are *IRREVERSIBLE* - funds cannot be recovered if sent to the wrong address\n' +
        '• Must be on the *CORRECT NETWORK* - sending to the wrong network can result in permanent loss\n\n' +
        'Please carefully verify:\n' +
        `• The wallet address: \`${displayAddress}\`\n` +
        `• The network: ${context.network.toUpperCase()}\n` +
        `• The amount: ${amount} USDC`,
        { parse_mode: 'Markdown' }
      );
    }
    
    // Set state to waiting for confirmation
    console.log(`[WALLET] Setting state to WAITING_FOR_WALLET_CONFIRMATION`);
    conversationManager.setState(chatId, ConversationState.WAITING_FOR_WALLET_CONFIRMATION);
  } catch (error) {
    console.error('[ERROR] Error preparing wallet transaction:', error);
    await ctx.reply('An error occurred while preparing the transaction. Please try again later.');
    conversationManager.resetState(chatId);
  }
}

/**
 * Handle external wallet address input for withdrawals
 */
export async function handleExternalWalletInput(ctx: Context, text: string, chatId: number): Promise<void> {
  const walletAddress = text.trim();
  
  // Basic validation for wallet address
  if (walletAddress.length < 10) {
    // Keep sendReply since we're expecting the user to correct their wallet address input
    await sendReply(ctx, 'Please enter a valid wallet address.');
    return;
  }
  
  conversationManager.updateContext(chatId, { externalWalletAddress: walletAddress });
  conversationManager.setState(chatId, ConversationState.WAITING_FOR_EXTERNAL_WALLET_NETWORK);
  
  // Ask for network selection - use ctx.reply since we expect button response, not text
  await ctx.reply('Select the network for this wallet address:', {
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Solana', callback_data: 'withdraw_network_solana' },
          { text: 'Ethereum', callback_data: 'withdraw_network_ethereum' }
        ]
      ]
    }
  });
}

/**
 * Handle external wallet network selection for withdrawals
 * This is triggered by callback queries, not text messages
 */
export async function handleExternalWalletNetworkSelection(ctx: Context, callbackData: string, chatId: number): Promise<void> {
  console.log(`[CONVERSATION] Processing external wallet network selection: ${callbackData}`);
  
  // Extract network from callback data
  const network = callbackData.replace('withdraw_network_', '');
  
  // Update context with the selected network
  conversationManager.updateContext(chatId, { network });
  
  // Move to next state - asking for amount
  conversationManager.setState(chatId, ConversationState.WAITING_FOR_EXTERNAL_WALLET_AMOUNT);
  
  // Ask for amount - use sendReply since we're expecting a text response (amount)
  await sendReply(ctx, `Please enter the amount in USDC to withdraw to your ${network.toUpperCase()} wallet:`);
}

/**
 * Handle amount input for external wallet withdrawals
 */
export async function handleExternalWalletAmountInput(ctx: Context, text: string, chatId: number): Promise<void> {
  const amount = text.trim();
  
  // Basic validation for amount
  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    // Keep sendReply since we're expecting the user to correct their amount input
    await sendReply(ctx, 'Please enter a valid amount greater than zero.');
    return;
  }
  
  const context = conversationManager.getContext(chatId);
  const externalWalletAddress = context.externalWalletAddress;
  const network = context.network;
  
  if (!externalWalletAddress || !network) {
    await ctx.reply('An error occurred. Please start over with the withdraw command.');
    conversationManager.resetState(chatId);
    return;
  }
  
  try {
    await ctx.reply(`Preparing to withdraw ${amount} USDC to ${externalWalletAddress} on ${network.toUpperCase()} network...`);
    
    // Get balances to check if user has enough funds
    const balances = await walletService.getBalances(chatId);
    
    if (!balances || balances.length === 0) {
      await ctx.reply('You don\'t have any wallet balances. Please deposit funds first.');
      conversationManager.resetState(chatId);
      return;
    }
    
    // Calculate total balance
    const totalBalance = balances.reduce((sum, wallet) => {
      return sum + parseFloat(wallet.balance);
    }, 0);
    
    if (totalBalance < parseFloat(amount)) {
      // Keep sendReply since we're expecting the user to correct their amount input
      await sendReply(ctx, `You don't have enough funds. Your current balance is ${totalBalance.toFixed(2)} USDC.`);
      return;
    }
    
    // Validate minimum amount for the network
    const validation = await walletService.validateMinimumAmount(amount, 'wallet', network);
    
    if (!validation.valid) {
      // Keep sendReply since we're expecting the user to correct their amount input
      await sendReply(ctx, `Amount is below the minimum required. Please enter at least ${validation.minimumAmount} USDC.`);
      return;
    }
    
    // Calculate fee
    const fee = await walletService.calculateFee(amount, 'wallet', network);
    const totalAmount = parseFloat(amount) + fee;
    
    // Check if total amount exceeds balance
    if (totalBalance < totalAmount) {
      // Keep sendReply since we're expecting the user to correct their amount input
      await sendReply(ctx, `You don't have enough funds to cover the amount plus fees. Your current balance is ${totalBalance.toFixed(2)} USDC and the total needed is ${totalAmount.toFixed(2)} USDC.`);
      return;
    }
    
    // Update context with amount
    conversationManager.updateContext(chatId, { amount });
    
    // Shortened address for display
    const shortenedAddress = externalWalletAddress.length > 16 
      ? `${externalWalletAddress.substring(0, 8)}...${externalWalletAddress.substring(externalWalletAddress.length - 8)}`
      : externalWalletAddress;
    
    // Show confirmation with fee information
    const confirmMessage = 
      `📤 *Withdrawal Confirmation*\n\n` +
      `*To:* \`${shortenedAddress}\`\n` +
      `*Network:* ${network.toUpperCase()}\n` +
      `*Amount:* ${amount} USDC\n` +
      `*Fee:* ${fee.toFixed(2)} USDC\n` +
      `*Total:* ${totalAmount.toFixed(2)} USDC\n\n` +
      `⚠️ *SECURITY NOTICE*: Withdrawals to external wallets cannot be reversed. Please verify the address is correct.`;
    
    // Confirmation buttons for withdrawal
    const confirmKeyboard = {
      inline_keyboard: [
        [
          { text: "✅ Confirm Withdrawal", callback_data: "confirm_withdrawal" }
        ],
        [
          { text: "❌ Cancel Withdrawal", callback_data: "cancel_withdrawal" }
        ]
      ]
    };
    
    // Send confirmation message with appropriate keyboard - use ctx.reply since we expect button response
    await ctx.reply(confirmMessage, {
      parse_mode: 'Markdown',
      reply_markup: confirmKeyboard
    });
    
    // Set confirmation state
    conversationManager.setState(chatId, ConversationState.WAITING_FOR_EXTERNAL_WALLET_CONFIRMATION);
  } catch (error) {
    console.error('[ERROR] Error preparing withdrawal:', error);
    await ctx.reply('An error occurred while preparing the withdrawal. Please try again later.');
    conversationManager.resetState(chatId);
  }
}

/**
 * Handle final withdrawal confirmation with the typed "CONFIRM" or "CANCEL"
 */
export async function handleWithdrawalFinalConfirmation(ctx: Context, text: string, chatId: number): Promise<void> {
  const confirmation = text.trim().toUpperCase();
  
  console.log(`[CONVERSATION] Processing withdrawal final confirmation: ${confirmation}`);
  
  if (confirmation === 'CONFIRM') {
    const context = conversationManager.getContext(chatId);
    
    if (!context.externalWalletAddress || !context.amount || !context.network) {
      await ctx.reply('Withdrawal information is incomplete. Please start over.');
      conversationManager.resetState(chatId);
      return;
    }
    
    try {
      // Show processing message
      await ctx.reply(`⏳ Processing withdrawal of ${context.amount} USDC to ${context.externalWalletAddress}...`);
      
      // Process the withdrawal - using sendFundsToWallet instead of walletWithdraw
      const result = await walletService.sendFundsToWallet(
        chatId,
        context.externalWalletAddress,
        context.amount,
        context.network
      );
      
      if (result) {
        await ctx.reply(
          `✅ *Withdrawal Successful!*\n\n` +
          `*Amount:* ${context.amount} USDC\n` +
          `*To:* ${context.externalWalletAddress}\n` +
          `*Network:* ${context.network}\n` +
          `*Transaction ID:* ${result.id || 'N/A'}\n\n` +
          `Your funds have been sent to the external wallet.`,
          { parse_mode: 'Markdown' }
        );
        
        // Show updated balance if available
        try {
          const balances = await walletService.getBalances(chatId);
          if (balances && balances.length > 0) {
            const totalBalance = balances.reduce((sum, wallet) => {
              return sum + parseFloat(wallet.balance);
            }, 0);
            
            await ctx.reply(`Your new balance is: ${totalBalance.toFixed(2)} USDC`);
          }
        } catch (error) {
          console.error('[ERROR] Error fetching updated balance:', error);
        }
      } else {
        await ctx.reply(
          `❌ *Withdrawal Failed*\n\n` +
          `Error: Unknown error\n\n` +
          `Please try again later or contact support if the issue persists.`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error: any) {
      console.error('[ERROR] Error processing withdrawal:', error);
      await ctx.reply(`Withdrawal failed: ${error.message || 'Unknown error'}`);
    }
    
    // Reset conversation state
    conversationManager.resetState(chatId);
    
  } else if (confirmation === 'CANCEL') {
    // Handle cancellation
    await ctx.reply(
      `🛑 Withdrawal cancelled. No funds have been moved.\n\n` +
      `What would you like to do next?`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💰 Check Balance', callback_data: 'menu_balance' },
              { text: '📤 Try Again', callback_data: 'menu_withdraw' }
            ]
          ]
        }
      }
    );
    conversationManager.resetState(chatId);
  } else {
    // Invalid response
    // Keep sendReply since we're expecting the user to provide the correct confirmation text
    await sendReply(ctx, 'Please type either "CONFIRM" to proceed with the withdrawal or "CANCEL" to abort.');
  }
} 
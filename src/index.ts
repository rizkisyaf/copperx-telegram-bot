import { Telegraf, session, Markup } from 'telegraf';
import { Context, Session } from './interfaces/context.interface';
import dotenv from 'dotenv';

// Services
import authService from './services/auth.service';
import walletService from './services/wallet.service';
import notificationService from './services/notification.service';
import apiService from './services/api.service';

// Commands
import bulkTransferCommand from './commands/bulk-transfer.command';
import paymentLinkCommand from './commands/payment-link.command';

// Utils
import conversationManager, { ConversationState } from './utils/conversation';
import * as formatter from './utils/formatter';

// Load environment variables
dotenv.config();

// Initialize bot
const bot = new Telegraf<Context>(process.env.BOT_TOKEN!);

// Set the bot instance for notification service
notificationService.setBot(bot);

// Configure session middleware
bot.use(session<Session>({
  defaultSession: () => ({
    auth: {
      isAuthenticated: false
    }
  })
}));

// Middleware
bot.use(session());

// Error handling middleware
bot.use(async (ctx, next) => {
  try {
    // Check API availability before proceeding
    const isApiReachable = await apiService.isReachable();
    if (!isApiReachable) {
      console.error('API is not reachable');
      // Only notify about API issues once every 5 minutes per chat
      const now = Date.now();
      const lastApiErrorNotification = ctx.session?.lastApiErrorNotification || 0;
      
      if (now - lastApiErrorNotification > 5 * 60 * 1000) {
        await ctx.reply('⚠️ The service is currently experiencing technical difficulties. Please try again in a few minutes.');
        ctx.session = { ...ctx.session, lastApiErrorNotification: now };
      }
      return;
    }
    
    // If API is reachable, proceed to the next middleware
    await next();
  } catch (error: any) {
    // Log the error
    console.error('Bot error:', error);
    
    // Send user-friendly error message
    let errorMessage = 'Sorry, an error occurred while processing your request.';
    
    // Check for specific error types
    if (error.message.includes('Too Many Requests')) {
      errorMessage = '⚠️ You\'re sending too many requests. Please wait a moment before trying again.';
    } else if (error.message.includes('not authenticated') || error.message.includes('Unauthorized')) {
      errorMessage = '⚠️ Your session has expired. Please log in again with /login';
      
      // Force logout if session is invalid
      if (ctx.chat?.id) {
        authService.logout(ctx.chat.id);
        conversationManager.clearChat(ctx.chat.id);
      }
    }
    
    try {
      await ctx.reply(errorMessage);
    } catch (e) {
      console.error('Error sending error message to user:', e);
    }
  }
});

// Register command modules
bot.use(bulkTransferCommand);
bot.use(paymentLinkCommand);

// Start command
bot.start(async (ctx) => {
  const welcomeMessage = 
    '👋 *Welcome to the Copperx Bot!*\n\n' +
    'I can help you manage your Copperx account, transfer funds, and more.\n\n' +
    '📋 *Available Commands:*\n' +
    '/login - Log in to your Copperx account\n' +
    '/profile - View your account profile\n' +
    '/balance - Check your wallet balances\n' +
    '/send - Send USDC to an email address\n' +
    '/withdraw - Withdraw USDC to an external wallet\n' +
    '/bank - Withdraw USDC to a bank account\n' +
    '/history - View your transaction history\n' +
    '/deposit - Show deposit information\n' +
    '/setdefault - Set your default wallet\n' +
    '/bulktransfer - Send USDC to multiple recipients at once\n' +
    '/paymentlink - Create a payment link\n' +
    '/logout - Log out from your account\n\n' +
    'To get started, use /login to connect your Copperx account.';
  
  await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
});

// Help command
bot.help(async (ctx) => {
  const chatId = ctx.chat.id;
  
  const helpMessage = `
*Copperx Bot Help*

*Authentication*:
/login - Log in with your Copperx email and OTP
/logout - Log out from your account
/profile - View your account profile

*Wallet Management*:
/balance - Check your wallet balances
/setdefault - Set your default wallet
/deposit - Show deposit information

*Transactions*:
/send - Send USDC to an email address
/withdraw - Withdraw USDC to an external wallet
/bank - Withdraw USDC to a bank account
/history - View your transaction history

*Other*:
/simulate - Simulate a deposit notification (for testing)
/help - Show this help message

Need assistance? Contact support at https://t.me/copperxcommunity/2183
  `;
  
  await ctx.replyWithMarkdown(helpMessage);
});

// Login command
bot.command('login', async (ctx) => {
  const chatId = ctx.chat.id;
  
  if (authService.isAuthenticated(chatId)) {
    await ctx.reply('You are already logged in. Use /logout first if you want to log in with a different account.');
    return;
  }
  
  conversationManager.setState(chatId, ConversationState.WAITING_FOR_EMAIL);
  await ctx.reply('Please enter your Copperx email address:');
});

// Logout command
bot.command('logout', async (ctx) => {
  const chatId = ctx.chat.id;
  
  if (!authService.isAuthenticated(chatId)) {
    await ctx.reply('You are not logged in. Use /login to sign in to your Copperx account.');
    return;
  }
  
  authService.logout(chatId);
  conversationManager.clearChat(chatId);
  await ctx.reply('You have been successfully logged out.');
});

// Profile command
bot.command('profile', async (ctx) => {
  const chatId = ctx.chat.id;
  
  if (!authService.isAuthenticated(chatId)) {
    await ctx.reply('You are not logged in. Use /login to sign in to your Copperx account.');
    return;
  }
  
  const profile = await authService.getProfile(chatId);
  
  if (!profile) {
    await ctx.reply('Failed to fetch your profile. Please try again later.');
    return;
  }
  
  const kyc = await authService.getKycStatus(chatId);
  
  let profileMessage = `
*Your Copperx Profile*

Email: ${profile.email}
Organization: ${profile.organization.name}
KYC Status: ${kyc ? formatter.formatKycStatus(kyc.status) : '❓ Unknown'}
  `;
  
  await ctx.replyWithMarkdown(profileMessage);
  
  if (!kyc || kyc.status.toLowerCase() !== 'verified') {
    await ctx.reply('Your KYC is not verified. Please complete KYC on the Copperx website: https://copperx.io');
  }
});

// Balance command
bot.command('balance', async (ctx) => {
  const chatId = ctx.chat.id;
  
  if (!authService.isAuthenticated(chatId)) {
    await ctx.reply('You are not logged in. Use /login to sign in to your Copperx account.');
    return;
  }
  
  await ctx.reply('Fetching your wallet balances...');
  
  const balances = await walletService.getBalances(chatId);
  
  if (!balances) {
    await ctx.reply('Failed to fetch your wallet balances. Please try again later.');
    return;
  }
  
  const message = `
*Your Wallet Balances*

${formatter.formatWalletBalances(balances)}
  `;
  
  await ctx.replyWithMarkdown(message);
});

// Set default wallet command
bot.command('setdefault', async (ctx) => {
  const chatId = ctx.chat.id;
  
  if (!authService.isAuthenticated(chatId)) {
    await ctx.reply('You are not logged in. Use /login to sign in to your Copperx account.');
    return;
  }
  
  const wallets = await walletService.getWallets(chatId);
  
  if (!wallets || wallets.length === 0) {
    await ctx.reply('You don\'t have any wallets to set as default.');
    return;
  }
  
  const buttons = wallets.map((wallet) => [
    Markup.button.callback(
      `${wallet.network} - ${wallet.address.substring(0, 10)}...`,
      `default_wallet:${wallet.id}`
    )
  ]);
  
  await ctx.reply(
    'Select a wallet to set as default:',
    Markup.inlineKeyboard(buttons)
  );
});

// Send command
bot.command('send', async (ctx) => {
  const chatId = ctx.chat.id;
  
  if (!authService.isAuthenticated(chatId)) {
    await ctx.reply('You are not logged in. Use /login to sign in to your Copperx account.');
    return;
  }
  
  conversationManager.setState(chatId, ConversationState.WAITING_FOR_RECIPIENT_EMAIL);
  await ctx.reply('Please enter the recipient\'s email address:');
});

// Withdraw command
bot.command('withdraw', async (ctx) => {
  const chatId = ctx.chat.id;
  
  if (!authService.isAuthenticated(chatId)) {
    await ctx.reply('You are not logged in. Use /login to sign in to your Copperx account.');
    return;
  }
  
  conversationManager.setState(chatId, ConversationState.WAITING_FOR_WALLET_ADDRESS);
  await ctx.reply('Please enter the wallet address to withdraw to:');
});

// Bank withdrawal command
bot.command('bank', async (ctx) => {
  const chatId = ctx.chat.id;
  
  if (!authService.isAuthenticated(chatId)) {
    await ctx.reply('You are not logged in. Use /login to sign in to your Copperx account.');
    return;
  }
  
  // Check if user has bank accounts
  const bankAccounts = await walletService.getBankAccounts(chatId);
  
  if (!bankAccounts || bankAccounts.length === 0) {
    await ctx.reply('You don\'t have any bank accounts linked to your Copperx account. Please add a bank account through the web app first.');
    return;
  }
  
  // Create buttons for each bank account
  const buttons = bankAccounts.map((account) => [
    Markup.button.callback(
      `${account.bankName} - ${account.accountNumberMasked}`,
      `bank_account:${account.id}`
    )
  ]);
  
  // Set state and wait for bank selection
  conversationManager.setState(chatId, ConversationState.WAITING_FOR_BANK_ACCOUNT);
  
  await ctx.reply(
    'Select a bank account to withdraw to:',
    Markup.inlineKeyboard(buttons)
  );
});

// History command
bot.command('history', async (ctx) => {
  const chatId = ctx.chat.id;
  
  if (!authService.isAuthenticated(chatId)) {
    await ctx.reply('You are not logged in. Use /login to sign in to your Copperx account.');
    return;
  }
  
  await ctx.reply('Fetching your transaction history...');
  
  const history = await walletService.getTransferHistory(chatId);
  
  if (!history) {
    await ctx.reply('Failed to fetch your transaction history. Please try again later.');
    return;
  }
  
  if (history.data.length === 0) {
    await ctx.reply('You don\'t have any transactions yet.');
    return;
  }
  
  const message = `
*Your Recent Transactions*

${formatter.formatTransferHistory(history.data.slice(0, 10))}
  `;
  
  await ctx.replyWithMarkdown(message);
});

// Deposit command
bot.command('deposit', async (ctx) => {
  const chatId = ctx.chat.id;
  
  if (!authService.isAuthenticated(chatId)) {
    await ctx.reply('You are not logged in. Use /login to sign in to your Copperx account.');
    return;
  }
  
  const wallets = await walletService.getWallets(chatId);
  
  if (!wallets || wallets.length === 0) {
    await ctx.reply('You don\'t have any wallets to deposit to.');
    return;
  }
  
  // Subscribe to notifications
  await notificationService.subscribeToOrganization(chatId);
  
  const defaultWallet = wallets.find(wallet => wallet.isDefault) || wallets[0];
  
  const message = `
*Deposit Information*

To deposit funds, send USDC to this wallet address:

Network: ${defaultWallet.network}
Address: \`${defaultWallet.address}\`

You will receive a notification when your deposit is confirmed.
  `;
  
  await ctx.replyWithMarkdown(message);
});

// Simulate deposit (for testing)
bot.command('simulate', async (ctx) => {
  const chatId = ctx.chat.id;
  
  if (!authService.isAuthenticated(chatId)) {
    await ctx.reply('You are not logged in. Use /login to sign in to your Copperx account.');
    return;
  }
  
  await notificationService.simulateDeposit(chatId, '100.00');
  await ctx.reply('Deposit notification simulated.');
});

// Handle callback queries
bot.on('callback_query', async (ctx) => {
  const chatId = ctx.chat?.id;
  
  if (!chatId) {
    return;
  }
  
  const callbackData = ctx.callbackQuery.data;
  
  if (!callbackData) {
    return;
  }
  
  // Set default wallet
  if (callbackData.startsWith('default_wallet:')) {
    const walletId = callbackData.split(':')[1];
    const success = await walletService.setDefaultWallet(chatId, walletId);
    
    if (success) {
      await ctx.editMessageText('Default wallet set successfully.');
    } else {
      await ctx.editMessageText('Failed to set default wallet. Please try again.');
    }
    return;
  }
  
  // Bank account selection
  if (callbackData.startsWith('bank_account:')) {
    const bankAccountId = callbackData.split(':')[1];
    
    if (conversationManager.getState(chatId) === ConversationState.WAITING_FOR_BANK_ACCOUNT) {
      conversationManager.updateContext(chatId, { bankAccountId });
      conversationManager.setState(chatId, ConversationState.WAITING_FOR_BANK_AMOUNT);
      
      await ctx.editMessageText(`Bank account selected. Please enter the amount to withdraw:`);
    }
    return;
  }
  
  // Network selection for wallet withdraw
  if (callbackData.startsWith('network:')) {
    const network = callbackData.split(':')[1];
    
    if (conversationManager.getState(chatId) === ConversationState.WAITING_FOR_WALLET_NETWORK) {
      conversationManager.updateContext(chatId, { network });
      conversationManager.setState(chatId, ConversationState.WAITING_FOR_WALLET_AMOUNT);
      
      await ctx.editMessageText(`Network selected: ${network.toUpperCase()}`);
      await ctx.reply('Please enter the amount of USDC to withdraw:');
    }
    return;
  }
  
  // Transaction confirmation
  if (callbackData === 'confirm_transaction') {
    const state = conversationManager.getState(chatId);
    const context = conversationManager.getContext(chatId);
    
    if (state === ConversationState.WAITING_FOR_SEND_CONFIRMATION) {
      const result = await walletService.sendFundsToEmail(chatId, context.recipientEmail!, context.amount!);
      
      if (result) {
        await ctx.editMessageText(`Transaction completed! ${context.amount} USDC sent to ${context.recipientEmail}.`);
      } else {
        await ctx.editMessageText('Transaction failed. Please try again later.');
      }
    } else if (state === ConversationState.WAITING_FOR_WALLET_CONFIRMATION) {
      const result = await walletService.sendFundsToWallet(chatId, context.walletAddress!, context.network!, context.amount!);
      
      if (result) {
        await ctx.editMessageText(`Transaction completed! ${context.amount} USDC sent to ${context.walletAddress}.`);
      } else {
        await ctx.editMessageText('Transaction failed. Please try again later.');
      }
    } else if (state === ConversationState.WAITING_FOR_BANK_CONFIRMATION) {
      const result = await walletService.withdrawToBank(chatId, context.bankAccountId!, context.amount!);
      
      if (result) {
        await ctx.editMessageText(`Withdrawal initiated! ${context.amount} USDC will be sent to your bank account. This may take 1-3 business days to complete.`);
      } else {
        await ctx.editMessageText('Withdrawal failed. Please try again later.');
      }
    }
    
    conversationManager.resetState(chatId);
    return;
  }
  
  // Cancel transaction
  if (callbackData === 'cancel_transaction') {
    await ctx.editMessageText('Transaction cancelled.');
    conversationManager.resetState(chatId);
    return;
  }
  
  await ctx.answerCbQuery();
});

// Handle text messages (for conversations)
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text;
  
  // Handle commands separately
  if (text.startsWith('/')) {
    return;
  }
  
  const state = conversationManager.getState(chatId);
  
  // Login flow
  if (state === ConversationState.WAITING_FOR_EMAIL) {
    const email = text.trim();
    
    if (!email.includes('@')) {
      await ctx.reply('Please enter a valid email address.');
      return;
    }
    
    await ctx.reply(`Requesting OTP for ${email}...`);
    
    const success = await authService.requestOTP(email, chatId);
    
    if (success) {
      conversationManager.setState(chatId, ConversationState.WAITING_FOR_OTP);
      await ctx.reply('OTP sent to your email. Please enter the OTP:');
    } else {
      conversationManager.resetState(chatId);
      await ctx.reply('Failed to request OTP. Please try again later or check your email address.');
    }
    return;
  }
  
  if (state === ConversationState.WAITING_FOR_OTP) {
    const otp = text.trim();
    
    await ctx.reply('Verifying OTP...');
    
    const user = await authService.authenticateWithOTP(otp, chatId);
    
    if (user) {
      conversationManager.resetState(chatId);
      await ctx.reply(`Welcome, ${user.email}! You are now logged in.`);
      
      // Subscribe to notifications
      await notificationService.subscribeToOrganization(chatId);
    } else {
      await ctx.reply('Invalid OTP. Please try again or use /login to restart.');
    }
    return;
  }
  
  // Send flow
  if (state === ConversationState.WAITING_FOR_RECIPIENT_EMAIL) {
    const email = text.trim();
    
    if (!email.includes('@')) {
      await ctx.reply('Please enter a valid email address.');
      return;
    }
    
    conversationManager.updateContext(chatId, { recipientEmail: email });
    conversationManager.setState(chatId, ConversationState.WAITING_FOR_SEND_AMOUNT);
    await ctx.reply('Please enter the amount of USDC to send:');
    return;
  }
  
  if (state === ConversationState.WAITING_FOR_SEND_AMOUNT) {
    const amount = text.trim();
    
    // Validate amount
    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      await ctx.reply('Please enter a valid amount greater than 0.');
      return;
    }
    
    // Validate minimum amount and check fees
    const validation = walletService.validateMinimumAmount(amount, 'email');
    if (!validation.valid) {
      await ctx.reply(`Amount too small. Minimum amount for email transfers is ${validation.minimumAmount} USDC.`);
      return;
    }
    
    // Check balance
    const balanceCheck = await walletService.checkBalance(chatId, amount);
    if (!balanceCheck.sufficient) {
      await ctx.reply(`Insufficient balance. Available: ${balanceCheck.availableBalance || '0'} USDC.`);
      return;
    }
    
    // Calculate fee
    const fee = walletService.calculateFee(amount, 'email');
    const feeInfo = walletService.getTransactionFeeInfo(amount, 'email');
    
    // Show fee information
    await ctx.replyWithMarkdown(formatter.formatTransactionFee(
      amount,
      feeInfo.fee,
      feeInfo.totalAmount,
      feeInfo.feePercentage
    ));
    
    // Update context with amount and fee
    conversationManager.updateContext(chatId, { amount, fee: feeInfo.fee });
    conversationManager.setState(chatId, ConversationState.WAITING_FOR_SEND_CONFIRMATION);
    
    const context = conversationManager.getContext(chatId);
    const confirmationMessage = formatter.formatConfirmationMessage(context);
    
    await ctx.replyWithMarkdown(
      confirmationMessage,
      Markup.inlineKeyboard([
        [Markup.button.callback('Confirm ✅', 'confirm_transaction')],
        [Markup.button.callback('Cancel ❌', 'cancel_transaction')]
      ])
    );
    return;
  }
  
  // Withdraw flow
  if (state === ConversationState.WAITING_FOR_WALLET_ADDRESS) {
    const address = text.trim();
    
    // Basic validation
    if (address.length < 10) {
      await ctx.reply('Please enter a valid wallet address.');
      return;
    }
    
    conversationManager.updateContext(chatId, { walletAddress: address });
    conversationManager.setState(chatId, ConversationState.WAITING_FOR_WALLET_NETWORK);
    
    await ctx.reply(
      'Please select the network:',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('Solana', 'network:solana'),
          Markup.button.callback('Ethereum', 'network:ethereum')
        ]
      ])
    );
    return;
  }
  
  if (state === ConversationState.WAITING_FOR_WALLET_NETWORK) {
    // This should be handled by the callback query, but in case user types the network
    const network = text.trim().toLowerCase();
    
    if (network !== 'solana' && network !== 'ethereum') {
      await ctx.reply('Please select a valid network or use the buttons provided.');
      return;
    }
    
    conversationManager.updateContext(chatId, { network });
    conversationManager.setState(chatId, ConversationState.WAITING_FOR_WALLET_AMOUNT);
    await ctx.reply('Please enter the amount of USDC to withdraw:');
    return;
  }
  
  if (state === ConversationState.WAITING_FOR_WALLET_AMOUNT) {
    const amount = text.trim();
    
    // Validate amount
    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      await ctx.reply('Please enter a valid amount greater than 0.');
      return;
    }
    
    const context = conversationManager.getContext(chatId);
    const network = context.network;
    
    // Validate minimum amount
    const validation = walletService.validateMinimumAmount(amount, 'wallet', network);
    if (!validation.valid) {
      await ctx.reply(`Amount too small. Minimum amount for ${network.toUpperCase()} transfers is ${validation.minimumAmount} USDC.`);
      return;
    }
    
    // Calculate fee
    const feeInfo = walletService.getTransactionFeeInfo(amount, 'wallet', network);
    
    // Check if user has sufficient balance
    const balanceCheck = await walletService.checkBalance(chatId, feeInfo.totalAmount.toString());
    if (!balanceCheck.sufficient) {
      await ctx.reply(`Insufficient balance. Available: ${balanceCheck.availableBalance || '0'} USDC. Required: ${feeInfo.totalAmount} USDC (includes ${feeInfo.fee} USDC fee).`);
      return;
    }
    
    // Show fee information
    await ctx.replyWithMarkdown(formatter.formatTransactionFee(
      amount,
      feeInfo.fee,
      feeInfo.totalAmount,
      feeInfo.feePercentage
    ));
    
    // Update context with amount and fee
    conversationManager.updateContext(chatId, { amount, fee: feeInfo.fee });
    conversationManager.setState(chatId, ConversationState.WAITING_FOR_WALLET_CONFIRMATION);
    
    const confirmationMessage = formatter.formatConfirmationMessage(context);
    
    await ctx.replyWithMarkdown(
      confirmationMessage,
      Markup.inlineKeyboard([
        [Markup.button.callback('Confirm ✅', 'confirm_transaction')],
        [Markup.button.callback('Cancel ❌', 'cancel_transaction')]
      ])
    );
    return;
  }
  
  // Bank withdraw flow
  if (state === ConversationState.WAITING_FOR_BANK_AMOUNT) {
    const amount = text.trim();
    
    // Validate amount
    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      await ctx.reply('Please enter a valid amount greater than 0.');
      return;
    }
    
    // Validate minimum amount
    const validation = walletService.validateMinimumAmount(amount, 'bank');
    if (!validation.valid) {
      await ctx.reply(`Amount too small. Minimum amount for bank withdrawals is ${validation.minimumAmount} USDC.`);
      return;
    }
    
    // Calculate fee
    const feeInfo = walletService.getTransactionFeeInfo(amount, 'bank');
    
    // Check if user has sufficient balance
    const balanceCheck = await walletService.checkBalance(chatId, feeInfo.totalAmount.toString());
    if (!balanceCheck.sufficient) {
      await ctx.reply(`Insufficient balance. Available: ${balanceCheck.availableBalance || '0'} USDC. Required: ${feeInfo.totalAmount} USDC (includes ${feeInfo.fee} USDC fee).`);
      return;
    }
    
    // Show fee information
    await ctx.replyWithMarkdown(formatter.formatTransactionFee(
      amount,
      feeInfo.fee,
      feeInfo.totalAmount,
      feeInfo.feePercentage
    ));
    
    // Update context with amount and fee
    conversationManager.updateContext(chatId, { amount, fee: feeInfo.fee });
    conversationManager.setState(chatId, ConversationState.WAITING_FOR_BANK_CONFIRMATION);
    
    const context = conversationManager.getContext(chatId);
    const confirmationMessage = formatter.formatConfirmationMessage(context);
    
    await ctx.replyWithMarkdown(
      confirmationMessage,
      Markup.inlineKeyboard([
        [Markup.button.callback('Confirm ✅', 'confirm_transaction')],
        [Markup.button.callback('Cancel ❌', 'cancel_transaction')]
      ])
    );
    return;
  }
});

// Error handler
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}`, err);
  ctx.reply('An error occurred. Please try again later.');
});

// Start the bot
bot.launch().then(() => {
  console.log('Bot started successfully!');
}).catch(err => {
  console.error('Failed to start bot:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 
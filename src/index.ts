import { Telegraf, session, Markup } from 'telegraf';
import dotenv from 'dotenv';

// Services
import authService from './services/auth.service';
import walletService from './services/wallet.service';
import notificationService from './services/notification.service';

// Utils
import conversationManager, { ConversationState } from './utils/conversation';
import * as formatter from './utils/formatter';

// Load environment variables
dotenv.config();

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN!);

// Set the bot instance for notification service
notificationService.setBot(bot);

// Middleware
bot.use(session());

// Start command
bot.start(async (ctx) => {
  const chatId = ctx.chat.id;
  conversationManager.clearChat(chatId);
  
  const welcomeMessage = `
🚀 *Welcome to the Copperx Bot!* 🚀

This bot allows you to manage your Copperx account directly from Telegram.

*Available Commands*:
/login - Log in to your Copperx account
/logout - Log out from your account
/profile - View your account profile
/balance - Check your wallet balances
/setdefault - Set your default wallet
/send - Send USDC to an email address
/withdraw - Withdraw USDC to an external wallet
/bank - Withdraw USDC to a bank account
/history - View your transaction history
/deposit - Show deposit information
/simulate - Simulate a deposit notification (for testing)
/help - Show this help message

Need help? Join our community: https://t.me/copperxcommunity/2183
  `;
  
  await ctx.replyWithMarkdown(welcomeMessage);
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
  
  await ctx.reply('Bank withdrawals are currently not available through the bot. Please use the Copperx web app for this feature.');
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
    
    conversationManager.updateContext(chatId, { amount });
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
    
    conversationManager.updateContext(chatId, { amount });
    conversationManager.setState(chatId, ConversationState.WAITING_FOR_WALLET_CONFIRMATION);
    
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
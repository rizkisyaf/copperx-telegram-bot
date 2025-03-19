import { Middleware } from 'telegraf';
import { Context } from '../interfaces/context.interface';
import authService from '../services/auth.service';
import walletService from '../services/wallet.service';
import notificationService from '../services/notification.service';
import conversationManager, { ConversationState } from '../utils/conversation';
import * as formatter from '../utils/formatter';
import { sendReply } from '../utils/telegram';

/**
 * Handler for menu actions triggered by inline keyboard buttons
 */
const menuActionHandler: Middleware<Context> = async (ctx, next) => {
  // Check if this is a callback query and has data
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    return next();
  }
  
  const callbackData = (ctx.callbackQuery as any).data as string;
  
  // Handle retry_otp action separately
  if (callbackData === 'retry_otp') {
    console.log('[CALLBACK] OTP retry action received');
    
    // Answer the callback query first
    await ctx.answerCbQuery();
    
    const chatId = ctx.chat?.id;
    if (!chatId) {
      console.error('[ERROR] No chat ID in callback query');
      return next();
    }
    
    // Set state to waiting for OTP
    conversationManager.setState(chatId, ConversationState.WAITING_FOR_OTP);
    // Use sendReply here since we're expecting a direct text response (OTP)
    await sendReply(ctx, 'Please enter the OTP again. Make sure to check your email inbox and spam folder.');
    return next();
  }
  
  // Check if the data starts with menu_
  if (!callbackData.startsWith('menu_')) {
    return next();
  }
  
  const match = callbackData.match(/^menu_(.+)$/);
  if (!match) {
    return next();
  }
  
  console.log('[CALLBACK] Menu action received:', match[1]);
  
  try {
    const action = match[1];
    const chatId = ctx.chat?.id;
    
    if (!chatId) {
      console.error('[ERROR] No chat ID in callback query');
      await ctx.answerCbQuery('Error processing request');
      return next();
    }
    
    // Answer the callback query first to avoid the "loading" state
    await ctx.answerCbQuery();
    
    switch (action) {
      case 'login':
        // Check if already logged in
        if (authService.isAuthenticated(chatId)) {
          await ctx.reply('You are already logged in. Use the Logout option first if you want to log in with a different account.');
          return next();
        }
        
        console.log(`[MENU] LOGIN: Setting state to WAITING_FOR_EMAIL for chat: ${chatId}`);
        const previousState = conversationManager.getState(chatId);
        console.log(`[MENU] LOGIN: Previous state was: ${previousState}`);
        conversationManager.setState(chatId, ConversationState.WAITING_FOR_EMAIL);
        const newState = conversationManager.getState(chatId);
        console.log(`[MENU] LOGIN: New state is: ${newState}`);
        // Use sendReply here since we're expecting a direct text response (email)
        console.log(`[MENU] LOGIN: About to call sendReply to request email`);
        const result = await sendReply(ctx, 'Please enter your Copperx email address:');
        console.log(`[MENU] LOGIN: sendReply result:`, result);
        break;
        
      case 'logout':
        if (!authService.isAuthenticated(chatId)) {
          await ctx.reply('You are not logged in. Use the Login option to sign in to your Copperx account.');
          return next();
        }
        
        authService.logout(chatId);
        conversationManager.clearChat(chatId);
        await ctx.reply('You have been successfully logged out.');
        break;
        
      case 'profile':
        if (!authService.isAuthenticated(chatId)) {
          await ctx.reply('You are not logged in. Use the Login option to sign in to your Copperx account.');
          return next();
        }
        
        await ctx.reply('Fetching your profile...');
        try {
          const profile = await authService.getProfile(chatId);
          
          if (!profile) {
            await ctx.reply('Failed to fetch your profile. Please try again later.');
            return next();
          }
          
          const kyc = await authService.getKycStatus(chatId);
          
          let profileMessage = 
            `📋 *Your Profile*\n\n` +
            `*Email:* ${profile.email}\n` +
            `*Organization:* ${profile.organization?.name || 'N/A'}\n` +
            `*KYC Status:* ${kyc ? formatter.formatKycStatus(kyc.status) : 'Not Submitted'}`;
          
          await ctx.reply(profileMessage, { parse_mode: 'Markdown' });
          
          if (!kyc || kyc.status.toLowerCase() !== 'verified') {
            await ctx.reply('⚠️ Your KYC is not verified. Please complete KYC on the Copperx website: https://copperx.io');
          }
        } catch (error) {
          console.error('[ERROR] Error fetching profile:', error);
          await ctx.reply('An error occurred while fetching your profile. Please try again later.');
        }
        break;
        
      case 'balance':
        if (!authService.isAuthenticated(chatId)) {
          await ctx.reply('You are not logged in. Use the Login option to sign in to your Copperx account.');
          return next();
        }
        
        await ctx.reply('Fetching your balances...');
        try {
          const balances = await walletService.getBalances(chatId);
          
          if (!balances || balances.length === 0) {
            await ctx.reply('💰 *No Balances Found*\n\nYou currently have no funds in your Copperx wallets. Use the Deposit option to add funds.', {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '💳 Deposit', callback_data: 'menu_deposit' }]
                ]
              }
            });
            return next();
          }
          
          // Format balances into a nice message
          let balanceMessage = '💰 *Your Balances*\n\n';
          
          balances.forEach((wallet, index) => {
            balanceMessage += `*${wallet.network || 'Default'}:* ${formatter.formatCurrency(wallet.balance)} USDC\n`;
          });
          
          // Calculate total balance across all wallets
          const totalBalance = balances.reduce((sum, wallet) => {
            return sum + parseFloat(wallet.balance);
          }, 0);
          
          balanceMessage += `\n*Total:* ${formatter.formatCurrency(totalBalance.toString())} USDC`;
          
          // Show keyboard with actions
          const balanceKeyboard = {
            inline_keyboard: [
              [
                { text: '💳 Deposit', callback_data: 'menu_deposit' },
                { text: '📤 Send', callback_data: 'menu_send' }
              ],
              [
                { text: '📥 Withdraw', callback_data: 'menu_withdraw' },
                { text: '🔁 Set Default', callback_data: 'menu_default_wallet' }
              ]
            ]
          };
          
          await ctx.reply(balanceMessage, {
            parse_mode: 'Markdown',
            reply_markup: balanceKeyboard
          });
        } catch (error) {
          console.error('[ERROR] Error fetching balances:', error);
          await ctx.reply('An error occurred while fetching your balances. Please try again later.');
        }
        break;
        
      case 'deposit':
        if (!authService.isAuthenticated(chatId)) {
          await ctx.reply('You are not logged in. Use the Login option to sign in to your Copperx account.');
          return next();
        }
        
        try {
          // Get wallets first to show deposit addresses
          const wallets = await walletService.getWallets(chatId);
          
          if (!wallets || !Array.isArray(wallets) || wallets.length === 0) {
            await ctx.reply('No wallets found. Please contact support.');
            return next();
          }
          
          // Show list of networks to deposit to
          const networkButtons = wallets.map(wallet => ([{
            text: `${wallet.network}`,
            callback_data: `deposit_${wallet.id}`
          }]));
          
          await ctx.reply('Select a network to deposit to:', {
            reply_markup: {
              inline_keyboard: networkButtons
            }
          });
        } catch (error) {
          console.error('[ERROR] Error fetching deposit info:', error);
          await ctx.reply('An error occurred while fetching deposit information. Please try again later.');
        }
        break;
        
      case 'send':
        if (!authService.isAuthenticated(chatId)) {
          await ctx.reply('You are not logged in. Use the Login option to sign in to your Copperx account.');
          return next();
        }
        
        // Check balances first
        try {
          const balances = await walletService.getBalances(chatId);
          
          if (!balances || balances.length === 0) {
            await ctx.reply('❌ *No Funds Available*\n\nYou need to deposit funds to your Copperx account before you can send.', {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '💳 Deposit', callback_data: 'menu_deposit' }]
                ]
              }
            });
            return next();
          }
          
          // Calculate total balance
          const totalBalance = balances.reduce((sum, wallet) => {
            return sum + parseFloat(wallet.balance);
          }, 0);
          
          if (totalBalance <= 0) {
            await ctx.reply('❌ *Insufficient Funds*\n\nYour balance is 0 USDC. Please deposit funds before sending.', {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '💳 Deposit', callback_data: 'menu_deposit' }]
                ]
              }
            });
            return next();
          }
          
          // Ask how they want to send
          const sendKeyboard = {
            inline_keyboard: [
              [
                { text: '📧 Send by Email', callback_data: 'send_email' },
                { text: '📒 Send to Wallet', callback_data: 'send_wallet' }
              ]
            ]
          };
          
          await ctx.reply(`💰 *Send Funds*\n\nYour available balance: ${formatter.formatCurrency(totalBalance.toString())} USDC\n\nHow would you like to send?`, {
            parse_mode: 'Markdown',
            reply_markup: sendKeyboard
          });
        } catch (error) {
          console.error('[ERROR] Error preparing send:', error);
          await ctx.reply('An error occurred while preparing the send options. Please try again later.');
        }
        break;
        
      case 'withdraw':
        if (!authService.isAuthenticated(chatId)) {
          await ctx.reply('You are not logged in. Use the Login option to sign in to your Copperx account.');
          return next();
        }
        
        // Create options for withdrawal
        const withdrawOptions = {
          inline_keyboard: [
            [{ text: 'Withdraw to Bank', callback_data: 'withdraw_bank' }],
            [{ text: 'Withdraw to External Wallet', callback_data: 'withdraw_wallet' }]
          ]
        };
        
        await ctx.reply('How would you like to withdraw funds?', {
          reply_markup: withdrawOptions
        });
        break;
        
      case 'history':
        if (!authService.isAuthenticated(chatId)) {
          await ctx.reply('You are not logged in. Use the Login option to sign in to your Copperx account.');
          return next();
        }
        
        await ctx.reply('Fetching your transaction history...');
        try {
          const transfersResponse = await walletService.getTransferHistory(chatId);
          
          if (!transfersResponse || !transfersResponse.data || transfersResponse.data.length === 0) {
            await ctx.reply('No transaction history found.');
            return next();
          }
          
          // Get the transfers array from the response
          const transfers = transfersResponse.data.slice(0, 10);
          
          await ctx.reply(formatter.formatTransferHistory(transfers), { 
            parse_mode: 'Markdown'
          });
        } catch (error) {
          console.error('[ERROR] Error fetching history:', error);
          await ctx.reply('An error occurred while fetching your transaction history. Please try again later.');
        }
        break;
        
      case 'help':
        const helpMessage = 
          '📋 *QuickRamp Bot Commands*\n\n' +
          '• 🔑 *Login* - Connect to your Copperx account\n' +
          '• 🚪 *Logout* - Sign out of your account\n' +
          '• 👤 *Profile* - View your account details\n' +
          '• 💰 *Balance* - Check your wallet balances\n' +
          '• 📤 *Send* - Transfer USDC to email or wallet\n' +
          '• 💸 *Withdraw* - Withdraw USDC to bank or wallet\n' +
          '• 📥 *Deposit* - View deposit instructions\n' +
          '• 📊 *History* - View transaction history\n\n' +
          'For detailed commands, use /help\n' +
          'For support, contact: https://t.me/copperxcommunity/2183';
        
        await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
        break;
        
      case 'send_email':
        if (!authService.isAuthenticated(chatId)) {
          await ctx.reply('You are not logged in. Use the Login option to sign in to your Copperx account.');
          return next();
        }
        
        conversationManager.setState(chatId, ConversationState.WAITING_FOR_RECIPIENT_EMAIL);
        // Use sendReply here since we're expecting a direct text response (email)
        await sendReply(ctx, 'Please enter the recipient\'s email address:');
        break;
        
      case 'send_wallet':
        if (!authService.isAuthenticated(chatId)) {
          await ctx.reply('You are not logged in. Use the Login option to sign in to your Copperx account.');
          return next();
        }
        
        conversationManager.setState(chatId, ConversationState.WAITING_FOR_WALLET_ADDRESS);
        // Use sendReply here since we're expecting a direct text response (wallet address)
        await sendReply(ctx, 'Please enter the recipient\'s wallet address:');
        break;
        
      default:
        await ctx.reply('This feature is coming soon. Please check back later.');
    }
  } catch (error) {
    console.error('[ERROR] Error handling menu action:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
  
  return next();
};

export default menuActionHandler; 
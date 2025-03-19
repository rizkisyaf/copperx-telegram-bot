import { Middleware } from 'telegraf';
import { Context } from '../interfaces/context.interface';
import authService from '../services/auth.service';

/**
 * Handler for the /help command - displays available commands and options
 */
const helpCommand: Middleware<Context> = async (ctx, next) => {
  console.log('[COMMAND] Help command received');
  
  // Check if user is authenticated to show appropriate options
  const chatId = ctx.chat?.id;
  const isAuthenticated = chatId ? authService.isAuthenticated(chatId) : false;
  
  // Create a keyboard based on authentication status
  const helpKeyboard = {
    inline_keyboard: [
      // First row
      [
        { text: '🔑 Login', callback_data: 'menu_login' },
        { text: '🚪 Logout', callback_data: 'menu_logout' }
      ],
      // Second row
      [
        { text: '👤 Profile', callback_data: 'menu_profile' },
        { text: '💰 Balance', callback_data: 'menu_balance' }
      ],
      // Third row
      [
        { text: '📤 Send', callback_data: 'menu_send' },
        { text: '💸 Withdraw', callback_data: 'menu_withdraw' }
      ],
      // Fourth row
      [
        { text: '📥 Deposit', callback_data: 'menu_deposit' },
        { text: '📊 History', callback_data: 'menu_history' }
      ]
    ]
  };
  
  // Create a help message with sections
  const helpMessage = 
    '📋 *QuickRamp Bot Commands*\n\n' +
    '*Account Commands:*\n' +
    '• `/login` - Connect to your Copperx account\n' +
    '• `/logout` - Sign out of your account\n' +
    '• `/profile` - View your account details\n\n' +
    '*Financial Commands:*\n' +
    '• `/balance` - Check your wallet balances\n' +
    '• `/send` - Transfer USDC to email or wallet\n' +
    '• `/withdraw` - Withdraw USDC to bank or wallet\n' +
    '• `/deposit` - View deposit instructions\n' +
    '• `/history` - View transaction history\n\n' +
    '*Other Commands:*\n' +
    '• `/start` - Restart the bot and see the main menu\n' +
    '• `/help` - Show this help message\n' +
    '• `/ping` - Check if the bot is responding\n\n' +
    (isAuthenticated ? 
      '✅ *You are currently logged in*. Use the buttons below to access features.' : 
      '⚠️ *You are not logged in*. Please log in to access all features.');
  
  try {
    // Send the help message with the keyboard
    await ctx.reply(helpMessage, {
      parse_mode: 'Markdown',
      reply_markup: helpKeyboard
    });
    
    // If not authenticated, send a prompt to log in
    if (!isAuthenticated) {
      await ctx.reply(
        '👉 To get started, tap the Login button above or use the /login command.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔑 Login Now', callback_data: 'menu_login' }]
            ]
          }
        }
      );
    }
    
    // If the user is authenticated, remind them about support
    if (isAuthenticated) {
      await ctx.reply(
        '📞 *Need Help?*\n\nIf you encounter any issues or have questions, contact our support team at:\nhttps://t.me/copperxcommunity/2183',
        { parse_mode: 'Markdown' }
      );
    }
  } catch (error) {
    console.error('[ERROR] Error sending help message:', error);
    // Fallback to plain text
    await ctx.reply('Use /start to see available commands and /login to sign in to your account.');
  }
  
  return next();
};

export default helpCommand; 
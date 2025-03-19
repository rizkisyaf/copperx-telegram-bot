import { Middleware } from 'telegraf';
import { Context } from '../interfaces/context.interface';
import authService from '../services/auth.service';

/**
 * Handler for the /start command - displays the welcome message and main menu
 */
const startCommand: Middleware<Context> = async (ctx, next) => {
  console.log('[COMMAND] Start command received');
  
  // Check if user is authenticated to tailor the message
  const chatId = ctx.chat?.id;
  const isAuthenticated = chatId ? authService.isAuthenticated(chatId) : false;
  
  try {
    // Create an inline keyboard with a grid layout and emojis
    const mainMenu = {
      inline_keyboard: [
        // First row - two buttons
        [
          { text: '🔑 Login', callback_data: 'menu_login' },
          { text: '🚪 Logout', callback_data: 'menu_logout' }
        ],
        // Second row - two buttons
        [
          { text: '👤 Profile', callback_data: 'menu_profile' },
          { text: '💰 Balance', callback_data: 'menu_balance' }
        ],
        // Third row - two buttons
        [
          { text: '📤 Send', callback_data: 'menu_send' },
          { text: '💸 Withdraw', callback_data: 'menu_withdraw' }
        ],
        // Fourth row - two buttons
        [
          { text: '📥 Deposit', callback_data: 'menu_deposit' },
          { text: '📊 History', callback_data: 'menu_history' }
        ],
        // Fifth row - one button centered
        [
          { text: '❓ Help', callback_data: 'menu_help' }
        ]
      ]
    };

    // Create a personalized welcome message based on authentication status
    const welcomeMessage = isAuthenticated 
      ? `👋 *Welcome back to the Copperx Bot!*\n\nYou're logged in and ready to go. What would you like to do today?` 
      : '👋 *Welcome to the Copperx Bot!*\n\n' +
        'I can help you manage your Copperx account, transfer funds, and more.\n\n' +
        'Please start by logging in to your Copperx account:';
    
    console.log('[DEBUG] About to send welcome message with markup');
    const sentMessage = await ctx.reply(welcomeMessage, { 
      parse_mode: 'Markdown',
      reply_markup: mainMenu
    });
    console.log('[DEBUG] Welcome message sent successfully, message ID:', sentMessage.message_id);
    
    // If user is not authenticated, send a follow-up message with login instructions
    if (!isAuthenticated && chatId) {
      await ctx.reply(
        '💡 *Get Started:*\n\n' +
        'To use most features, you\'ll need to log in first. Tap the Login button above or use the /login command.\n\n' +
        'Need help? Type /help to see all available commands.',
        { parse_mode: 'Markdown' }
      );
    }
    
    // If user is authenticated, show a quick status message
    if (isAuthenticated && chatId) {
      const session = authService.getSession(chatId);
      if (session && session.email) {
        await ctx.reply(
          `✅ *Logged in as:* ${session.email}\n\n` +
          'Use the buttons above to manage your Copperx account.',
          { parse_mode: 'Markdown' }
        );
      }
    }
  } catch (error) {
    console.error('[ERROR] Error in start command:', error);
    // Try sending a plain text message if Markdown fails
    try {
      await ctx.reply('Welcome to the Copperx Bot! Use /help to see available commands and /login to sign in.');
    } catch (err) {
      console.error('[ERROR] Failed to send fallback welcome message:', err);
    }
  }
  
  return next();
};

export default startCommand; 
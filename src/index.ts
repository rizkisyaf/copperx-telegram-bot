import { Telegraf, session } from 'telegraf';
import dotenv from 'dotenv';
import http from 'http';

// Services
import notificationService from './services/notification.service';

// Commands
import startCommand from './commands/start.command';
import helpCommand from './commands/help.command';
import { loginCommand, logoutCommand } from './commands/auth.command';
import { pingCommand, testCommand } from './commands/utility.command';
import bulkTransferCommand from './commands/bulk-transfer.command';
import paymentLinkCommand from './commands/payment-link.command';

// Actions
import menuActionHandler from './actions/menu.actions';
import { 
  defaultWalletActionHandler, 
  depositActionHandler, 
  sendActionHandler, 
  withdrawActionHandler,
  confirmTransactionHandler 
} from './actions/wallet.actions';

// Middleware
import loggingMiddleware from './middleware/logging.middleware';
import conversationMiddleware from './middleware/conversation.middleware';
import callbackMiddleware from './middleware/callback.middleware';

// Interfaces
import { Context, Session } from './interfaces/context.interface';
import authService from './services/auth.service';

// Load environment variables
dotenv.config();

// Validate essential environment variables
if (!process.env.BOT_TOKEN) {
  console.error('[FATAL] BOT_TOKEN environment variable is not set!');
  process.exit(1);
}

// Create HTTP server for health check endpoint
const server = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

// Start HTTP server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Health check server running on port ${PORT}`);
});

// Initialize bot with Telegraf
const bot = new Telegraf<Context>(process.env.BOT_TOKEN!);

// Apply middleware (order matters)
console.log('[SETUP] Applying middleware in order');
bot.use(loggingMiddleware); // This should be first to log all updates
console.log('[SETUP] Applied logging middleware');

// Session middleware
bot.use(session({
  defaultSession: () => ({
    lastApiErrorNotification: 0,
    auth: { isAuthenticated: false }
  })
}));
console.log('[SETUP] Applied session middleware');

// Configure notification service
notificationService.setBot(bot as any);
console.log('[SETUP] Configured notification service');

// First chat handler - triggered when a user first interacts with the bot via Telegram's "Start" button
bot.start(async (ctx) => {
  console.log('[FIRST_CHAT] New user started a chat:', ctx.from?.username || ctx.from?.id);
  
  // Check if user is authenticated to tailor the message
  const chatId = ctx.chat?.id;
  const isAuthenticated = chatId ? authService.isAuthenticated(chatId) : false;
  
  try {
    // Create a friendly welcome message with emoji
    const welcomeMessage = 
      '👋 *Welcome to the QuickRamp Bot!*\n\n' +
      'I can help you manage your Copperx account, transfer funds, and more. ' +
      (isAuthenticated ? 'What would you like to do today?' : 'First, you\'ll need to log in to your Copperx account.') +
      (!isAuthenticated ? '\n\n*Note:* You must have an existing Copperx account to use this bot. If you don\'t have one yet, please sign up at copperx.io first.' : '');
    
    // Create an attractive keyboard with primary options
    const welcomeKeyboard = {
      inline_keyboard: [
        [
          { text: '🔑 Login', callback_data: 'menu_login' },
          { text: '❓ Help', callback_data: 'menu_help' }
        ],
        [
          { text: '🌐 Create Copperx Account', url: 'https://copperx.io/sign-up' }
        ]
      ]
    };
    
    // Send a welcome message with the keyboard
    await ctx.reply(welcomeMessage, {
      parse_mode: 'Markdown',
      reply_markup: welcomeKeyboard
    });
    
    // Additional step: After the welcome message, provide more context
    await ctx.reply(
      '💡 *What can I do?*\n\n' +
      '• Connect to your Copperx account\n' +
      '• Check your wallet balances\n' +
      '• Send and receive USDC\n' +
      '• View transaction history\n' +
      '• Manage your profile\n\n' +
      'For detailed commands, type /help or tap the Help button.',
      { parse_mode: 'Markdown' }
    );
    
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
    console.error('[ERROR] Failed to send welcome message:', error);
    
    // Fallback to plain text if Markdown fails
    await ctx.reply('Welcome to the QuickRamp Bot! Use /login to sign in to your account or /help to see available commands.');
  }
});

// Conversation handler - moved earlier in the middleware chain to ensure it gets first chance at text messages
console.log('[SETUP] About to apply conversation middleware - this is critical for handling email input');
bot.use(conversationMiddleware);
console.log('[SETUP] Applied conversation middleware');

// Callback middleware for conversation-related callbacks
bot.use(callbackMiddleware);
console.log('[SETUP] Applied callback middleware');

// Simple utility commands that should be registered early
bot.command('ping', pingCommand);
bot.command('test', testCommand);

// Main commands - but we'll skip the start command since we're handling it directly above
bot.command('help', helpCommand);
bot.command('login', loginCommand);
bot.command('logout', logoutCommand);

// Register other command modules
bot.use(bulkTransferCommand);
bot.use(paymentLinkCommand);
console.log('[SETUP] Registered command modules');

// Action handlers
bot.use(menuActionHandler);
bot.use(defaultWalletActionHandler);
bot.use(depositActionHandler);
bot.use(sendActionHandler);
bot.use(withdrawActionHandler);
bot.use(confirmTransactionHandler);
console.log('[SETUP] Applied all action handlers');

// Global error handler
bot.catch((err, ctx) => {
  console.error('[ERROR] Bot error:', err);
  try {
    ctx.reply('An error occurred. Please try again later.');
  } catch (e) {
    console.error('[ERROR] Failed to send error message:', e);
  }
});

// Define bot commands for the menu interface (burger button)
const commands = [
  { command: 'start', description: 'Start the bot and show the main menu' },
  { command: 'help', description: 'Show available commands and options' },
  { command: 'login', description: 'Log in to your Copperx account' },
  { command: 'logout', description: 'Log out from your Copperx account' },
  { command: 'ping', description: 'Check if the bot is responding' },
  { command: 'test', description: 'Test if the bot is working correctly' }
];

// Start the bot
console.log('[STARTUP] Starting bot with token:', process.env.BOT_TOKEN ? `${process.env.BOT_TOKEN.substring(0, 5)}...` : 'NOT_SET');
console.log('[STARTUP] Launching bot...');

bot.launch({
  dropPendingUpdates: true
}).then(async () => {
  console.log('[STARTUP] Bot started successfully!');
  console.log(`[STARTUP] Bot information:`, {
    id: bot.botInfo?.id,
    username: bot.botInfo?.username,
    isBot: bot.botInfo?.is_bot,
    firstName: bot.botInfo?.first_name,
  });

  // Set commands to enable the menu interface
  try {
    await bot.telegram.setMyCommands(commands);
    console.log('[STARTUP] Bot commands set successfully');
    
    // Add a test call to authService.requestOTP to see if it works
    console.log('[STARTUP] Testing authService.requestOTP function...');
    try {
      const testEmail = "test@example.com";
      const testChatId = 12345;
      console.log(`[STARTUP] Calling requestOTP with email=${testEmail}, chatId=${testChatId}`);
      const result = await authService.requestOTP(testEmail, testChatId);
      console.log(`[STARTUP] requestOTP test result: ${result ? 'Success' : 'Failed'}`);
    } catch (testError) {
      console.error('[STARTUP] Error testing requestOTP:', testError);
    }
  } catch (error) {
    console.error('[ERROR] Failed to set bot commands:', error);
  }
}).catch(err => {
  console.error('[STARTUP] Failed to start bot:', err);
});

// Enable graceful stop
process.once('SIGINT', () => {
  console.log('[SHUTDOWN] Stopping bot due to SIGINT');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('[SHUTDOWN] Stopping bot due to SIGTERM');
  bot.stop('SIGTERM');
}); 
import { Middleware } from 'telegraf';
import { Context } from '../interfaces/context.interface';
import conversationManager, { ConversationState } from '../utils/conversation';

// Import all handlers from the conversations directory
import * as conversationHandlers from './conversations';

// Type definition for conversation handlers
type ConversationHandler = (ctx: Context, text: string, chatId: number) => Promise<void>;

// Registry mapping conversation states to their handlers
const handlerRegistry: Partial<Record<ConversationState, ConversationHandler>> = {
  // Authentication handlers
  [ConversationState.WAITING_FOR_EMAIL]: conversationHandlers.handleEmailInput,
  [ConversationState.WAITING_FOR_OTP]: conversationHandlers.handleOtpInput,
  
  // Email transfer handlers
  [ConversationState.WAITING_FOR_RECIPIENT_EMAIL]: conversationHandlers.handleRecipientEmailInput,
  [ConversationState.WAITING_FOR_SEND_AMOUNT]: conversationHandlers.handleSendAmountInput,
  
  // Wallet transfer handlers
  [ConversationState.WAITING_FOR_WALLET_ADDRESS]: conversationHandlers.handleWalletAddressInput,
  [ConversationState.WAITING_FOR_WALLET_AMOUNT]: conversationHandlers.handleWalletAmountInput,
  
  // External wallet withdrawal handlers
  [ConversationState.WAITING_FOR_EXTERNAL_WALLET]: conversationHandlers.handleExternalWalletInput,
  [ConversationState.WAITING_FOR_EXTERNAL_WALLET_AMOUNT]: conversationHandlers.handleExternalWalletAmountInput,
  [ConversationState.WAITING_FOR_WITHDRAWAL_FINAL_CONFIRMATION]: conversationHandlers.handleWithdrawalFinalConfirmation,
  
  // Additional handlers will be registered here as they are implemented
};

// Callback data to handler mapping for network selections and other callback-driven conversation steps
type CallbackHandler = (ctx: Context, callbackData: string, chatId: number) => Promise<void>;

// Registry for callback data handlers
export const callbackHandlerRegistry: Record<string, CallbackHandler> = {
  'network_': conversationHandlers.handleWalletNetworkSelection,
  'withdraw_network_': conversationHandlers.handleExternalWalletNetworkSelection,
  // Add other callback patterns and their handlers here
};

/**
 * Middleware to handle text messages and manage conversation state
 * Routes the messages to appropriate handlers based on conversation state
 */
const conversationMiddleware: Middleware<Context> = async (ctx, next) => {
  console.log(`[CONVERSATION] ====== STARTING CONVERSATION MIDDLEWARE ======`);
  console.log(`[CONVERSATION] Context type:`, ctx.updateType);
  console.log(`[CONVERSATION] Has message:`, !!ctx.message);
  
  if (ctx.message) {
    console.log(`[CONVERSATION] Message properties:`, Object.keys(ctx.message));
  }
  
  // Check if this is a valid text message (using type guard)
  if (!ctx.message || !('text' in ctx.message) || typeof ctx.message.text !== 'string') {
    console.log(`[CONVERSATION] Not a valid text message, skipping middleware`);
    console.log(`[CONVERSATION] Update type: ${ctx.updateType}`);
    
    if (ctx.message) {
      console.log(`[CONVERSATION] Message type:`, typeof ctx.message);
      console.log(`[CONVERSATION] Message content:`, JSON.stringify(ctx.message, null, 2));
    }
    
    console.log(`[CONVERSATION] ====== ENDING CONVERSATION MIDDLEWARE (SKIPPED) ======`);
    return next();
  }
  
  // At this point we know ctx.message.text exists and is a string
  console.log(`[CONVERSATION] Processing text message: "${ctx.message.text}"`);
  
  // Skip command messages - they are handled by dedicated handlers
  if (ctx.message.text.startsWith('/')) {
    console.log(`[CONVERSATION] Message is a command, skipping middleware: ${ctx.message.text}`);
    console.log(`[CONVERSATION] ====== ENDING CONVERSATION MIDDLEWARE (COMMAND SKIPPED) ======`);
    return next();
  }
  
  // Make sure we have a chat
  if (!ctx.chat) {
    console.error('[ERROR] Chat not found in text message handler');
    console.log(`[CONVERSATION] ====== ENDING CONVERSATION MIDDLEWARE (NO CHAT) ======`);
    return next();
  }
  
  const chatId = ctx.chat.id;
  const text = ctx.message.text;
  
  console.log(`[TEXT] Received message: "${text}" from ${ctx.from?.username || 'unknown user'} (${chatId})`);
  
  // Get conversation state
  const state = conversationManager.getState(chatId);
  console.log(`[CONVERSATION] Current state for chat ${chatId}: ${state || 'NONE'}`);
  
  try {
    // Get the handler for the current state
    const handler = handlerRegistry[state];
    
    if (handler) {
      console.log(`[CONVERSATION] Found handler for state: ${state}, executing handler now`);
      // Execute the appropriate handler
      await handler(ctx, text, chatId);
      console.log(`[CONVERSATION] Handler execution completed for state: ${state}`);
    } else if (state !== ConversationState.IDLE) {
      console.log(`[WARNING] No handler found for state: ${state}`);
      // State exists but no handler - reset the state to prevent being stuck
      conversationManager.resetState(chatId);
      await ctx.reply('Sorry, something went wrong with your current operation. Please try again.');
    } else {
      // Default response for unhandled states
      console.log(`[CONVERSATION] No active conversation, providing default response`);
      await ctx.reply('I didn\'t understand that. Please select an option from the menu or use /help to see available commands.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Show Menu', callback_data: 'menu_help' }]
          ]
        }
      });
    }
  } catch (error: any) {
    console.error('[ERROR] Error in text message handler:', error);
    console.error('[ERROR] Stack trace:', error.stack);
    // Reset state on error to prevent users from being stuck
    conversationManager.resetState(chatId);
    await ctx.reply('An error occurred processing your request. Please try again.');
  }
  
  console.log(`[CONVERSATION] ====== ENDING CONVERSATION MIDDLEWARE (COMPLETED) ======`);
  return next();
};

export default conversationMiddleware; 
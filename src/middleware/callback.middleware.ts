import { Middleware } from 'telegraf';
import { Context } from '../interfaces/context.interface';
import { callbackHandlerRegistry } from './conversation.middleware';

/**
 * Middleware to handle callback queries related to conversation flows
 * This handles specific callbacks that should be processed as part of a conversation flow
 * rather than as separate actions
 */
const callbackMiddleware: Middleware<Context> = async (ctx, next) => {
  // Check if this is a callback query and has data
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    return next();
  }
  
  const callbackData = (ctx.callbackQuery as any).data as string;
  const chatId = ctx.chat?.id;
  
  // Make sure we have a chat
  if (!chatId) {
    console.error('[ERROR] Chat ID not found in callback query');
    return next();
  }
  
  console.log(`[CALLBACK] Received: "${callbackData}"`);
  
  try {
    // Check if the callback data matches any of our registered prefixes
    const matchingPrefix = Object.keys(callbackHandlerRegistry).find(prefix => 
      callbackData.startsWith(prefix)
    );
    
    if (matchingPrefix) {
      // Answer the callback query first to remove the loading indicator
      await ctx.answerCbQuery();
      
      // Get the handler for this prefix
      const handler = callbackHandlerRegistry[matchingPrefix];
      
      // Execute the handler
      await handler(ctx, callbackData, chatId);
      
      // Don't pass to next middleware since we've handled this callback
      return;
    }
  } catch (error) {
    console.error('[ERROR] Error in callback handler:', error);
    await ctx.answerCbQuery('An error occurred');
    await ctx.reply('An error occurred while processing your request. Please try again later.');
  }
  
  // If we reach here, pass to the next middleware
  return next();
};

export default callbackMiddleware; 
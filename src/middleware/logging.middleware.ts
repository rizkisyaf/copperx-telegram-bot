import { Middleware } from 'telegraf';
import { Context } from '../interfaces/context.interface';

/**
 * Middleware for logging all incoming updates
 * This should be the first middleware in the chain
 */
const loggingMiddleware: Middleware<Context> = async (ctx, next) => {
  // Basic update logging
  console.log(`[LOG] Received update type: ${ctx.updateType}, ID: ${ctx.update.update_id}`);
  console.log(`[LOG] Full update:`, JSON.stringify(ctx.update, null, 2));
  console.log(`[LOG] Context keys:`, Object.keys(ctx));
  
  try {
    // Detailed logging for different types of updates
    if (ctx.message) {
      console.log(`[LOG] Message object keys: ${Object.keys(ctx.message).join(', ')}`);
      
      if ('text' in ctx.message) {
        console.log(`[LOG] Message text: "${ctx.message.text}" from ${ctx.from?.username || 'unknown'} (${ctx.from?.id})`);
        console.log(`[LOG] IMPORTANT: This is a TEXT message, should be handled by conversation middleware`);
      } else {
        console.log(`[LOG] Message without text property from ${ctx.from?.username || 'unknown'} (${ctx.from?.id})`);
        console.log(`[LOG] Message content:`, JSON.stringify(ctx.message, null, 2));
      }
    } else if (ctx.callbackQuery) {
      // Safe access to callback data with type checking
      if ('data' in ctx.callbackQuery) {
        const callbackData = (ctx.callbackQuery as any).data as string;
        console.log(`[LOG] Callback query: "${callbackData}" from ${ctx.from?.username || 'unknown'} (${ctx.from?.id})`);
      } else {
        console.log(`[LOG] Callback query without data from ${ctx.from?.username || 'unknown'} (${ctx.from?.id})`);
      }
    }
    
    // Try to process the update and catch any errors
    console.log('[LOG] Before next() middleware call');
    await next();
    console.log('[LOG] After next() middleware call - Handler completed successfully');
  } catch (error) {
    console.error('[ERROR] Error in middleware:', error);
    
    // Try to reply to the user with an error message
    try {
      await ctx.reply('An error occurred while processing your request. Please try again later.');
    } catch (e) {
      console.error('[ERROR] Failed to send error message:', e);
    }
  }
};

export default loggingMiddleware; 
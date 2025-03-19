import { Middleware } from 'telegraf';
import { Context } from '../interfaces/context.interface';
import conversationManager, { ConversationState } from '../utils/conversation';
import authService from '../services/auth.service';

/**
 * Handler for the /login command - initiates the login flow
 */
export const loginCommand: Middleware<Context> = async (ctx, next) => {
  console.log('[COMMAND] Login command received');
  
  // Check if chat is defined
  if (!ctx.chat) {
    console.error('[ERROR] Chat not found in login command');
    return next();
  }
  
  const chatId = ctx.chat.id;
  
  if (authService.isAuthenticated(chatId)) {
    await ctx.reply('You are already logged in. Use /logout first if you want to log in with a different account.');
    return next();
  }
  
  conversationManager.setState(chatId, ConversationState.WAITING_FOR_EMAIL);
  await ctx.reply('Please enter your Copperx email address:');
  
  return next();
};

/**
 * Handler for the /logout command - logs the user out
 */
export const logoutCommand: Middleware<Context> = async (ctx, next) => {
  console.log('[COMMAND] Logout command received');
  
  // Check if chat is defined
  if (!ctx.chat) {
    console.error('[ERROR] Chat not found in logout command');
    return next();
  }
  
  const chatId = ctx.chat.id;
  
  if (!authService.isAuthenticated(chatId)) {
    await ctx.reply('You are not logged in. Use /login to sign in to your Copperx account.');
    return next();
  }
  
  authService.logout(chatId);
  conversationManager.clearChat(chatId);
  await ctx.reply('You have been successfully logged out.');
  
  return next();
}; 
import { Middleware } from 'telegraf';
import { Context } from '../interfaces/context.interface';

/**
 * Handler for the /ping command - responds with "Pong!"
 * Used to check if the bot is responding
 */
export const pingCommand: Middleware<Context> = async (ctx, next) => {
  console.log('[COMMAND] Ping command received - direct response');
  try {
    await ctx.reply('Pong! Bot is responding directly.');
    console.log('[COMMAND] Ping response sent successfully');
  } catch (error) {
    console.error('[ERROR] Failed to send ping response:', error);
  }
  return next();
};

/**
 * Handler for the /test command - responds with a test message
 * Used to verify the bot's basic functionality
 */
export const testCommand: Middleware<Context> = async (ctx, next) => {
  console.log('[COMMAND] Test command received');
  try {
    await ctx.reply('Test command works! The bot is responding correctly.');
    console.log('[COMMAND] Test response sent successfully');
  } catch (error) {
    console.error('[ERROR] Failed to send test response:', error);
  }
  return next();
}; 
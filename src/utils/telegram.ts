import { Context } from '../interfaces/context.interface';

/**
 * Send a reply message that properly chains to the original message
 * @param ctx The context object
 * @param message The message text to send
 * @param options Additional options for the message
 */
export async function sendReply(ctx: Context, message: string): Promise<any> {
  console.log('[TELEGRAM] sendReply called with message:', message.substring(0, 30) + (message.length > 30 ? '...' : ''));
  console.log('[TELEGRAM] Context object:', {
    updateType: ctx.updateType,
    hasMessage: !!ctx.message,
    hasChat: !!ctx.chat,
    hasFrom: !!ctx.from
  });
  
  // Make sure we have a chat
  if (!ctx.chat) {
    console.error('[TELEGRAM] Error: No chat context found in sendReply');
    return null;
  }
  
  const chatId = ctx.chat.id;
  console.log(`[TELEGRAM] Sending reply to chat: ${chatId}`);
  
  // Create message options with ForceReply to show "Reply to" prompt
  const messageOptions = {
    parse_mode: 'Markdown' as const,
    reply_markup: {
      force_reply: true as const,
      selective: true
    }
  };
  
  try {
    console.log('[TELEGRAM] Sending message with force_reply with options:', JSON.stringify(messageOptions));
    const sentMessage = await ctx.telegram.sendMessage(chatId, message, messageOptions);
    console.log('[TELEGRAM] Message sent successfully:', sentMessage.message_id);
    return sentMessage;
  } catch (error) {
    console.error('[TELEGRAM] Error sending reply:', error);
    
    // Fallback to basic reply without Markdown if there's an error
    try {
      console.log('[TELEGRAM] Attempting fallback without Markdown');
      return await ctx.telegram.sendMessage(chatId, message, {
        reply_markup: {
          force_reply: true as const,
          selective: true
        }
      });
    } catch (fallbackError) {
      console.error('[TELEGRAM] Fallback also failed:', fallbackError);
      return null;
    }
  }
} 
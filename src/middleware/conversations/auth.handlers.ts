import { Context } from '../../interfaces/context.interface';
import conversationManager, { ConversationState } from '../../utils/conversation';
import authService from '../../services/auth.service';
import notificationService from '../../services/notification.service';
import { sendReply } from '../../utils/telegram';

/**
 * Handle user email input for login
 */
export async function handleEmailInput(ctx: Context, text: string, chatId: number): Promise<void> {
  console.log(`[AUTH_HANDLER] handleEmailInput function called with text: "${text}" and chatId: ${chatId}`);
  const email = text.trim();
  
  console.log(`[CONVERSATION] Processing email input: ${email}`);
  console.log(`[DEBUG] Context details: chatId=${chatId}, hasMessage=${!!ctx.message}, hasCallbackQuery=${!!ctx.callbackQuery}`);
  
  if (!email.includes('@')) {
    console.log(`[CONVERSATION] Invalid email format: ${email}`);
    await sendReply(ctx, 'Please enter a valid email address with the format example@domain.com.');
    return;
  }
  
  try {
    console.log(`[AUTH] Requesting OTP for email: ${email}`);
    
    // First inform the user we're working on it
    console.log('[AUTH] Sending initial response to user');
    await ctx.reply(`Requesting OTP for ${email}...\n\nPlease wait while we contact the server.`);
    
    // Show typing indicator
    console.log('[AUTH] Sending typing indicator');
    await ctx.telegram.sendChatAction(chatId, 'typing');
    
    // Log the current state
    console.log(`[AUTH] Current state before API call: ${conversationManager.getState(chatId)}`);
    
    // Request OTP
    console.log(`[AUTH] Calling authService.requestOTP with email=${email}, chatId=${chatId}`);
    const success = await authService.requestOTP(email, chatId);
    
    console.log(`[AUTH] OTP request result: ${success ? 'Success' : 'Failed'}`);
    
    if (success) {
      console.log(`[AUTH] Setting state to WAITING_FOR_OTP for chat: ${chatId}`);
      conversationManager.setState(chatId, ConversationState.WAITING_FOR_OTP);
      console.log(`[AUTH] New state: ${conversationManager.getState(chatId)}`);
      
      console.log('[AUTH] Sending OTP success message');
      const result = await sendReply(ctx, '📬 OTP sent to your email. Please check your inbox and enter the code below.\n\nIf you don\'t see the email, please check your spam folder.');
      console.log('[AUTH] sendReply result:', result);
    } else {
      console.log(`[AUTH] Resetting state due to failed OTP request`);
      conversationManager.resetState(chatId);
      
      const signupKeyboard = {
        inline_keyboard: [
          [{ text: '🔑 Try Again', callback_data: 'menu_login' }],
          [{ text: '🌐 Create a Copperx Account', url: 'https://copperx.io/sign-up' }]
        ]
      };
      
      console.log('[AUTH] Sending OTP failure message');
      await ctx.reply(
        '⚠️ Failed to request OTP. This could be due to:\n\n' +
        '• Email not registered with Copperx\n' +
        '• Server connectivity issues\n' +
        '• Rate limiting\n\n' + 
        '*Don\'t have a Copperx account?*\n' +
        'You need to create an account on the Copperx website first before using this bot.',
        {
          parse_mode: 'Markdown',
          reply_markup: signupKeyboard
        }
      );
    }
    console.log('[AUTH] handleEmailInput function completed');
  } catch (error) {
    console.error('[ERROR] Error requesting OTP:', error);
    console.log(`[AUTH] Resetting state due to error in OTP request`);
    conversationManager.resetState(chatId);
    
    const errorKeyboard = {
      inline_keyboard: [
        [{ text: '🔑 Try Again', callback_data: 'menu_login' }],
        [{ text: '🌐 Create a Copperx Account', url: 'https://copperx.io/sign-up' }]
      ]
    };
    
    console.log('[AUTH] Sending error message');
    await ctx.reply(
      '❌ An error occurred while requesting OTP. Our team has been notified.\n\n' +
      '*Not registered with Copperx yet?*\n' + 
      'You need to create an account on the Copperx website first before using this bot.',
      {
        parse_mode: 'Markdown',
        reply_markup: errorKeyboard
      }
    );
  }
}

/**
 * Handle OTP input for verification
 */
export async function handleOtpInput(ctx: Context, text: string, chatId: number): Promise<void> {
  const otp = text.trim();
  
  console.log(`[CONVERSATION] Processing OTP input (masked): ${otp.substring(0, 1)}****`);
  
  if (!/^\d+$/.test(otp)) {
    await sendReply(ctx, 'The OTP should only contain numbers. Please enter a valid OTP.');
    return;
  }
  
  try {
    await ctx.reply('🔐 Verifying OTP...');
    
    await ctx.telegram.sendChatAction(chatId, 'typing');
    
    const user = await authService.authenticateWithOTP(otp, chatId);
    
    if (user) {
      conversationManager.resetState(chatId);
      
      const mainKeyboard = {
        inline_keyboard: [
          [
            { text: '💰 Check Balance', callback_data: 'menu_balance' },
            { text: '📤 Send Funds', callback_data: 'menu_send' }
          ],
          [
            { text: '📋 View Profile', callback_data: 'menu_profile' },
            { text: '📊 Transaction History', callback_data: 'menu_history' }
          ]
        ]
      };
      
      await ctx.reply(
        `✅ Welcome, ${user.email}! You have successfully logged in.`,
        { reply_markup: mainKeyboard }
      );
      
      await notificationService.subscribeToOrganization(chatId);
    } else {
      const retryKeyboard = {
        inline_keyboard: [
          [
            { text: '🔄 Try Again', callback_data: 'retry_otp' },
            { text: '🔙 Start Over', callback_data: 'menu_login' }
          ]
        ]
      };
      
      await ctx.reply(
        '❌ Invalid OTP or the OTP has expired. Please try again or restart the login process.',
        { reply_markup: retryKeyboard }
      );
    }
  } catch (error) {
    console.error('[ERROR] Error authenticating with OTP:', error);
    
    const errorKeyboard = {
      inline_keyboard: [
        [{ text: '🔙 Back to Login', callback_data: 'menu_login' }]
      ]
    };
    
    await ctx.reply(
      '❌ An error occurred while verifying your OTP. This could be due to server connectivity issues or an expired OTP. Please try logging in again.',
      { reply_markup: errorKeyboard }
    );
  }
} 
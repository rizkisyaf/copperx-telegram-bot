import { Context } from '../../interfaces/context.interface';
import conversationManager, { ConversationState } from '../../utils/conversation';
import walletService from '../../services/wallet.service';
import { sendReply } from '../../utils/telegram';

/**
 * Handle recipient email input for sending funds
 */
export async function handleRecipientEmailInput(ctx: Context, text: string, chatId: number): Promise<void> {
  const recipientEmail = text.trim();
  
  console.log(`[SEND] Processing recipient email input: ${recipientEmail}`);
  
  // Email validation
  if (!recipientEmail.includes('@')) {
    console.log(`[SEND] Invalid email format: ${recipientEmail}`);
    await sendReply(ctx, 'Please enter a valid email address with the format example@domain.com.');
    return;
  }
  
  // More comprehensive email validation using regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(recipientEmail)) {
    console.log(`[SEND] Email failed regex validation: ${recipientEmail}`);
    await sendReply(ctx, 'Please enter a valid email address. The format should be username@domain.com');
    return;
  }
  
  // Update context and state
  console.log(`[SEND] Valid email, updating context with recipient: ${recipientEmail}`);
  conversationManager.updateContext(chatId, { recipientEmail });
  conversationManager.setState(chatId, ConversationState.WAITING_FOR_SEND_AMOUNT);
  
  await sendReply(ctx, `Enter the amount in USDC to send to ${recipientEmail}:`);
}

/**
 * Handle amount input for sending funds
 */
export async function handleSendAmountInput(ctx: Context, text: string, chatId: number): Promise<void> {
  const amount = text.trim();
  
  console.log(`[SEND] Processing send amount input: ${amount}`);
  
  // Basic validation for amount
  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    console.log(`[SEND] Invalid amount: ${amount}`);
    await sendReply(ctx, 'Please enter a valid amount greater than zero. For example: 10.5');
    return;
  }
  
  // Check for reasonable maximum amount
  if (parseFloat(amount) > 10000) {
    console.log(`[SEND] Amount exceeds reasonable maximum: ${amount}`);
    await sendReply(ctx, 'The amount appears to be unusually high. Please enter an amount less than 10,000 USDC or contact support for assistance with large transfers.');
    return;
  }
  
  const context = conversationManager.getContext(chatId);
  const recipientEmail = context.recipientEmail;
  
  if (!recipientEmail) {
    console.log(`[SEND] Missing recipient email in context`);
    await ctx.reply('An error occurred. Please start over with the send command.');
    conversationManager.resetState(chatId);
    return;
  }
  
  try {
    console.log(`[SEND] Preparing to send ${amount} USDC to ${recipientEmail}`);
    await ctx.reply(`Preparing to send ${amount} USDC to ${recipientEmail}...`);
    
    // Validate minimum amount
    const validation = await walletService.validateMinimumAmount(amount, 'email');
    
    if (!validation.valid) {
      console.log(`[SEND] Amount below minimum: ${amount} < ${validation.minimumAmount}`);
      await sendReply(ctx, `Amount is below the minimum required. Please enter at least ${validation.minimumAmount} USDC.`);
      return;
    }
    
    // Calculate fee
    const fee = await walletService.calculateFee(amount, 'email');
    const totalAmount = parseFloat(amount) + fee;
    
    console.log(`[SEND] Fee calculated: ${fee} USDC, Total: ${totalAmount} USDC`);
    
    // Update context with amount
    conversationManager.updateContext(chatId, { amount });
    
    // Check if this is a high-value transaction (over 100 USDC)
    const isHighValue = parseFloat(amount) > 100;
    
    // Show confirmation with fee information and security advisories for high-value transactions
    const confirmMessage = 
      `📤 *Transfer Confirmation*\n\n` +
      `*To:* ${recipientEmail}\n` +
      `*Amount:* ${amount} USDC\n` +
      `*Fee:* ${fee.toFixed(2)} USDC\n` +
      `*Total:* ${totalAmount.toFixed(2)} USDC\n` +
      (isHighValue ? `\n⚠️ *SECURITY NOTICE*: This is a high-value transaction.\n• Please verify the recipient is correct.\n• Transfers cannot be reversed once sent.\n` : '') +
      `\nAre you sure you want to proceed?`;
    
    // Different confirmation buttons based on transaction value
    const confirmKeyboard = isHighValue ? 
      {
        inline_keyboard: [
          [
            { text: "✅ Yes, I've verified the recipient", callback_data: "confirm_send" }
          ],
          [
            { text: "❌ Cancel Transaction", callback_data: "cancel_send" }
          ]
        ]
      } :
      {
         inline_keyboard: [
           [
             { text: "Confirm", callback_data: "confirm_send" },
             { text: "Cancel", callback_data: "cancel_send" }
           ]
         ]
      };
    
    // Send confirmation message with appropriate keyboard
    await ctx.reply(confirmMessage, {
      parse_mode: 'Markdown',
      reply_markup: confirmKeyboard
    });
    
    // For high-value transactions, send an additional security reminder
    if (isHighValue) {
      console.log(`[SEND] Sending additional security reminder for high-value transaction`);
      await ctx.reply(
        '🔒 *Additional Security Reminder*\n\n' +
        'Cryptocurrency transactions are irreversible. Once funds are sent, they cannot be retrieved if sent to the wrong recipient.\n\n' +
        'Please take a moment to double-check:\n' +
        '• The recipient email is correct\n' +
        '• The amount is correct\n' +
        '• You trust the recipient',
        { parse_mode: 'Markdown' }
      );
    }
    
    // Set confirmation state
    console.log(`[SEND] Setting state to WAITING_FOR_SEND_CONFIRMATION`);
    conversationManager.setState(chatId, ConversationState.WAITING_FOR_SEND_CONFIRMATION);
  } catch (error) {
    console.error('[ERROR] Error preparing send transaction:', error);
    await ctx.reply('An error occurred while preparing the transaction. Please try again later.');
    conversationManager.resetState(chatId);
  }
} 
import { Composer, Markup } from 'telegraf';
import { Context } from '../interfaces/context.interface';
import walletService from '../services/wallet.service';
import { formatter } from '../utils/formatter';
import { BulkRecipient } from '../interfaces/wallet.interface';

const bulkTransferCommand = new Composer<Context>();

/**
 * /bulktransfer - Send USDC to multiple recipients at once
 * This command initiates the bulk transfer flow
 */
bulkTransferCommand.command('bulktransfer', async (ctx) => {
  // Reset context for a new bulk transfer
  ctx.session.bulkTransfer = {
    recipients: [],
    currentStep: 'init'
  };
  
  await ctx.reply(
    '💰 *Bulk Transfer*\n\n' +
    'Send USDC to multiple recipients at once. I\'ll guide you through the process.\n\n' +
    'You can add recipients one by one or import a CSV file.',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Add Recipients One by One', 'bulk_add_manually')],
        [Markup.button.callback('Import from CSV (Coming Soon)', 'bulk_import_csv')],
        [Markup.button.callback('Cancel', 'bulk_cancel')]
      ])
    }
  );
});

/**
 * Handle manual adding of recipients
 */
bulkTransferCommand.action('bulk_add_manually', async (ctx) => {
  ctx.session.bulkTransfer.currentStep = 'add_email';
  await ctx.editMessageText(
    '✉️ *Add Recipient*\n\n' +
    'Please enter the email address of the recipient:',
    { parse_mode: 'Markdown' }
  );
  
  // Remove the inline keyboard
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
});

/**
 * Handle the CSV import option (placeholder for future implementation)
 */
bulkTransferCommand.action('bulk_import_csv', async (ctx) => {
  await ctx.answerCbQuery('This feature is coming soon.');
});

/**
 * Handle cancel action
 */
bulkTransferCommand.action('bulk_cancel', async (ctx) => {
  ctx.session.bulkTransfer = undefined;
  await ctx.editMessageText('Bulk transfer canceled.');
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
});

/**
 * Handle all text inputs for the bulk transfer flow
 */
bulkTransferCommand.on('text', async (ctx) => {
  // Skip if not in bulk transfer mode
  if (!ctx.session.bulkTransfer) return;
  
  const message = ctx.message.text;
  const step = ctx.session.bulkTransfer.currentStep;
  
  if (step === 'add_email') {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(message)) {
      await ctx.reply('⚠️ Invalid email format. Please enter a valid email address:');
      return;
    }
    
    // Store the email and move to amount step
    ctx.session.bulkTransfer.currentEmail = message;
    ctx.session.bulkTransfer.currentStep = 'add_amount';
    
    await ctx.reply(
      `✉️ Recipient: *${message}*\n\n` +
      'Now, please enter the amount to send in USDC:',
      { parse_mode: 'Markdown' }
    );
  } 
  else if (step === 'add_amount') {
    // Validate amount is a number greater than 0
    const amount = parseFloat(message);
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('⚠️ Invalid amount. Please enter a valid number greater than 0:');
      return;
    }
    
    // Validate minimum amount
    const validation = await walletService.validateMinimumAmount(amount.toString(), 'email');
    if (!validation.valid) {
      await ctx.reply(`⚠️ Amount too small. Minimum amount is ${validation.minimumAmount} USDC. Please enter a valid amount:`);
      return;
    }
    
    // Add recipient to the list
    const recipient: BulkRecipient = {
      email: ctx.session.bulkTransfer.currentEmail!,
      amount: amount.toString()
    };
    
    ctx.session.bulkTransfer.recipients.push(recipient);
    
    // Ask if user wants to add more recipients
    await ctx.reply(
      `✅ Added ${recipient.email} (${formatter.formatCurrency(amount)} USDC)\n\n` +
      `Current recipients: ${ctx.session.bulkTransfer.recipients.length}`,
      {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('Add Another Recipient', 'bulk_add_another')],
          [Markup.button.callback('Continue to Review', 'bulk_review')],
          [Markup.button.callback('Cancel', 'bulk_cancel')]
        ])
      }
    );
  }
});

/**
 * Handle adding another recipient
 */
bulkTransferCommand.action('bulk_add_another', async (ctx) => {
  ctx.session.bulkTransfer.currentStep = 'add_email';
  ctx.session.bulkTransfer.currentEmail = undefined;
  
  await ctx.editMessageText(
    `✉️ *Add Recipient*\n\n` +
    `Current recipients: ${ctx.session.bulkTransfer.recipients.length}\n\n` +
    'Please enter the email address of the next recipient:',
    { parse_mode: 'Markdown' }
  );
  
  // Remove the inline keyboard
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
});

/**
 * Handle the review action to show a summary before confirming
 */
bulkTransferCommand.action('bulk_review', async (ctx) => {
  const { recipients } = ctx.session.bulkTransfer;
  
  if (recipients.length === 0) {
    await ctx.answerCbQuery('No recipients added yet.');
    return;
  }
  
  try {
    // Calculate fees
    const feeInfo = await walletService.getBulkTransactionFeeInfo(recipients, ctx.chat.id);
    
    // Store fee info in session
    ctx.session.bulkTransfer.feeInfo = feeInfo;
    
    // Create a formatted list of recipients
    const recipientsList = recipients.map((r, i) => 
      `${i + 1}. ${r.email}: ${formatter.formatCurrency(parseFloat(r.amount))} USDC`
    ).join('\n');
    
    // Show confirmation message with fee details
    await ctx.editMessageText(
      '📋 *Bulk Transfer Review*\n\n' +
      `*Recipients:*\n${recipientsList}\n\n` +
      `*Total Amount:* ${formatter.formatCurrency(feeInfo.totalAmount)} USDC\n` +
      `*Fee:* ${formatter.formatCurrency(feeInfo.fee)} USDC (${feeInfo.feePercentage}%)\n` +
      `*Total with Fee:* ${formatter.formatCurrency(feeInfo.totalWithFee)} USDC\n\n` +
      'Please confirm if you want to proceed with this bulk transfer:',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Confirm Transfer', 'bulk_confirm')],
          [Markup.button.callback('❌ Cancel', 'bulk_cancel')],
          [Markup.button.callback('🔙 Back to Add More', 'bulk_add_another')]
        ])
      }
    );
  } catch (error: any) {
    await ctx.editMessageText(
      '❌ *Error Preparing Bulk Transfer*\n\n' +
      `${error.message || 'An unknown error occurred.'}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('Try Again', 'bulk_review')],
          [Markup.button.callback('Cancel', 'bulk_cancel')]
        ])
      }
    );
  }
});

/**
 * Handle the confirmation action to execute the bulk transfer
 */
bulkTransferCommand.action('bulk_confirm', async (ctx) => {
  const { recipients } = ctx.session.bulkTransfer;
  
  try {
    // Show processing message
    await ctx.editMessageText(
      '⏳ *Processing Bulk Transfer*\n\n' +
      'Please wait while I process your transfer...',
      { parse_mode: 'Markdown' }
    );
    
    // Execute the bulk transfer
    const result = await walletService.sendBulkTransfers(ctx.chat.id, recipients);
    
    // Success message
    await ctx.editMessageText(
      '✅ *Bulk Transfer Successful*\n\n' +
      `Successfully sent to ${recipients.length} recipients.\n\n` +
      `Total Amount: ${formatter.formatCurrency(ctx.session.bulkTransfer.feeInfo.totalAmount)} USDC\n` +
      `Fee: ${formatter.formatCurrency(ctx.session.bulkTransfer.feeInfo.fee)} USDC\n` +
      `Total with Fee: ${formatter.formatCurrency(ctx.session.bulkTransfer.feeInfo.totalWithFee)} USDC`,
      { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📜 View Transaction History', 'history')]
        ])
      }
    );
    
    // Clear the bulk transfer session
    ctx.session.bulkTransfer = undefined;
  } catch (error: any) {
    await ctx.editMessageText(
      '❌ *Bulk Transfer Failed*\n\n' +
      `${error.message || 'An unknown error occurred.'}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('Try Again', 'bulk_review')],
          [Markup.button.callback('Cancel', 'bulk_cancel')]
        ])
      }
    );
  }
});

export default bulkTransferCommand; 
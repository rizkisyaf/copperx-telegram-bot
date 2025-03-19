import { Composer, Markup } from 'telegraf';
import { Context } from '../interfaces/context.interface';
import walletService from '../services/wallet.service';
import * as formatter from '../utils/formatter';

const paymentLinkCommand = new Composer<Context>();

/**
 * /paymentlink - Create a payment link for others to send you USDC
 * This command initiates the payment link creation flow
 */
paymentLinkCommand.command('paymentlink', async (ctx) => {
  // Reset context for a new payment link
  ctx.session.paymentLink = {
    step: 'init'
  };
  
  await ctx.reply(
    '🔗 *Create Payment Link*\n\n' +
    'Create a payment link that others can use to send you USDC. I\'ll guide you through the process.',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Create Payment Link', 'payment_create')],
        [Markup.button.callback('Cancel', 'payment_cancel')]
      ])
    }
  );
});

/**
 * Handle start of payment link creation
 */
paymentLinkCommand.action('payment_create', async (ctx) => {
  ctx.session.paymentLink!.step = 'amount';
  await ctx.editMessageText(
    '💰 *Payment Link Amount*\n\n' +
    'Please enter the amount in USDC that you want to request:',
    { parse_mode: 'Markdown' }
  );
  
  // Remove the inline keyboard
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
});

/**
 * Handle cancel action
 */
paymentLinkCommand.action('payment_cancel', async (ctx) => {
  ctx.session.paymentLink = undefined;
  await ctx.editMessageText('Payment link creation canceled.');
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
});

/**
 * Handle all text inputs for the payment link flow
 */
paymentLinkCommand.on('text', async (ctx) => {
  // Skip if not in payment link mode
  if (!ctx.session.paymentLink) return;
  
  const message = ctx.message.text;
  const step = ctx.session.paymentLink.step;
  
  if (step === 'amount') {
    // Validate amount is a number greater than 0
    const amount = parseFloat(message);
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('⚠️ Invalid amount. Please enter a valid number greater than 0:');
      return;
    }
    
    // Store the amount and move to description step
    ctx.session.paymentLink.amount = amount.toString();
    ctx.session.paymentLink.step = 'description';
    
    await ctx.reply(
      `💰 Amount: *${formatter.formatCurrency(amount)} USDC*\n\n` +
      'Now, please enter a description for this payment (e.g., "Invoice #123" or "Coffee payment"):',
      { parse_mode: 'Markdown' }
    );
  } 
  else if (step === 'description') {
    // Store the description and move to expiry step
    ctx.session.paymentLink.description = message;
    ctx.session.paymentLink.step = 'expiry';
    
    await ctx.reply(
      `📝 Description: *${message}*\n\n` +
      'How long should this payment link be valid for?',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('24 hours', 'payment_expiry_24')],
          [Markup.button.callback('48 hours', 'payment_expiry_48')],
          [Markup.button.callback('7 days', 'payment_expiry_168')],
          [Markup.button.callback('30 days', 'payment_expiry_720')],
          [Markup.button.callback('No expiry', 'payment_expiry_0')]
        ])
      }
    );
  }
});

/**
 * Handle expiry selection
 */
paymentLinkCommand.action(/payment_expiry_(\d+)/, async (ctx) => {
  const hours = parseInt(ctx.match[1]);
  ctx.session.paymentLink!.expiresIn = hours;
  ctx.session.paymentLink!.step = 'confirm';
  
  // Show confirmation
  await ctx.editMessageText(
    '🔗 *Payment Link Summary*\n\n' +
    `Amount: *${formatter.formatCurrency(parseFloat(ctx.session.paymentLink!.amount!))} USDC*\n` +
    `Description: *${ctx.session.paymentLink!.description}*\n` +
    `Expiry: *${hours === 0 ? 'Never expires' : `Expires in ${hours} hours`}*\n\n` +
    'Ready to create this payment link?',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Create Link', 'payment_confirm')],
        [Markup.button.callback('❌ Cancel', 'payment_cancel')]
      ])
    }
  );
});

/**
 * Handle the confirmation action to create the payment link
 */
paymentLinkCommand.action('payment_confirm', async (ctx) => {
  const { amount, description, expiresIn } = ctx.session.paymentLink!;
  
  try {
    // Show processing message
    await ctx.editMessageText(
      '⏳ *Creating Payment Link*\n\n' +
      'Please wait while I create your payment link...',
      { parse_mode: 'Markdown' }
    );
    
    // Create the payment link
    if (!ctx.chat) {
      throw new Error('Chat context is not available');
    }
    
    const result = await walletService.createPaymentLink(
      ctx.chat.id,
      amount!,
      description!,
      expiresIn
    );
    
    if (!result) {
      throw new Error('Failed to create payment link.');
    }
    
    // Success message with the link
    await ctx.editMessageText(
      '✅ *Payment Link Created*\n\n' +
      `Amount: *${formatter.formatCurrency(parseFloat(amount!))} USDC*\n` +
      `Description: *${description}*\n` +
      `Expiry: *${expiresIn === 0 ? 'Never expires' : `Expires in ${expiresIn} hours`}*\n\n` +
      '📎 *Your Payment Link:*\n' +
      `${result.link}\n\n` +
      'Share this link with anyone who needs to pay you USDC.',
      { 
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true }
      }
    );
    
    // Clear the payment link session
    ctx.session.paymentLink = undefined;
  } catch (error: any) {
    await ctx.editMessageText(
      '❌ *Payment Link Creation Failed*\n\n' +
      `${error.message || 'An unknown error occurred.'}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('Try Again', 'payment_create')],
          [Markup.button.callback('Cancel', 'payment_cancel')]
        ])
      }
    );
  }
});

export default paymentLinkCommand; 
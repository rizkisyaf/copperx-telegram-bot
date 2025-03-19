# Conversation Handlers

This directory contains handler modules for different types of conversations in the Copperx Telegram Bot.

## Structure

The handlers are organized into modules based on functionality:

- **auth.handlers.ts**: Authentication-related conversations (email input, OTP verification)
- **send.handlers.ts**: Handlers for sending funds to email addresses
- **wallet.handlers.ts**: Handlers for wallet-related operations (address input, network selection, etc.)
- **index.ts**: Central export point for all handlers

## Handler Types

There are two main types of handlers:

1. **Text Input Handlers**: Process text messages from users based on the current conversation state
2. **Callback Handlers**: Process callback queries from inline keyboards (like network selection)

## Implementation Details

### Auth Handlers

- **handleEmailInput**: Validates email format, requests OTP from the auth service
- **handleOtpInput**: Validates OTP format, attempts authentication, transitions to main menu on success

### Send Handlers

- **handleRecipientEmailInput**: Validates recipient email, transitions to amount input
- **handleSendAmountInput**: Validates amount, calculates fees, shows confirmation with security notices

### Wallet Handlers

- **handleWalletAddressInput**: Validates wallet address format, transitions to network selection
- **handleWalletNetworkSelection**: Processes network callback selection, transitions to amount input
- **handleWalletAmountInput**: Validates amount, calculates fees based on network, shows confirmation
- **handleExternalWalletInput**: Similar to wallet address input but for withdrawals
- **handleExternalWalletNetworkSelection**: Network selection for withdrawals
- **handleExternalWalletAmountInput**: Amount input for withdrawals with balance checks
- **handleWithdrawalFinalConfirmation**: Final text confirmation ("CONFIRM"/"CANCEL") for withdrawals

## Adding New Handlers

To add a new handler:

1. Identify the appropriate module or create a new one
2. Implement the handler function with the standard signature:
   ```typescript
   async function handleSomething(ctx: Context, text: string, chatId: number): Promise<void>
   ```
3. Export the handler from the module
4. Register it in the main conversation middleware

## Best Practices

- Follow the pattern of existing handlers for consistency
- Always validate input before processing
- Clearly log the conversation flow for debugging
- Provide helpful error messages when validation fails
- Use appropriate security measures for sensitive operations
- For high-value transactions, implement additional security confirmations
- Maintain a clear separation of concerns between handlers 
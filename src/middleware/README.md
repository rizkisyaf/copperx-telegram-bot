# Middleware Architecture in Copperx Telegram Bot

This directory contains middleware modules used by the Copperx Telegram Bot to process updates and manage conversations with users.

## Overview

The middleware architecture is designed with modularity and separation of concerns in mind. Each middleware handles a specific aspect of the bot's functionality:

- **Logging Middleware**: Captures all updates and logs them for debugging purposes
- **Conversation Middleware**: Manages text-based conversations and state transitions
- **Callback Middleware**: Handles callback queries related to conversation flows

## Conversation Middleware System

One of the most complex parts of a Telegram bot is managing conversations - the back-and-forth interactions with users. Our conversation middleware system uses a modular approach to make this more maintainable:

### Key Components

1. **Conversation Manager**: Stores and manages conversation states and contexts for each chat
2. **Conversation States**: Enum defining all possible states in a conversation
3. **Handler Registry**: Maps conversation states to their respective handler functions
4. **Callback Registry**: Maps callback data patterns to their respective handlers
5. **Handler Modules**: Organized by functionality (auth, wallet, send, etc.)

### Flow

1. A user sends a message to the bot
2. The conversation middleware checks the current state for that user
3. It uses the handler registry to find the appropriate handler function
4. The handler processes the input and may update the conversation state
5. For callback queries, the callback middleware uses the callback registry to find the appropriate handler

### Conversation Handlers

Handlers are organized into modules by functionality:

- **auth.handlers.ts**: Handles authentication flow (email input, OTP verification)
- **send.handlers.ts**: Handles sending funds to email addresses
- **wallet.handlers.ts**: Handles wallet-related operations (address input, network selection, amount input)

Each handler is responsible for:
1. Validating input
2. Updating conversation context
3. Transitioning to the next state
4. Providing appropriate user feedback

### Adding New Handlers

To add a new conversation handler:

1. Add a new state to `ConversationState` enum in `conversation.ts`
2. Create a handler function in the appropriate module (or create a new module)
3. Register the handler in `conversation.middleware.ts` under `handlerRegistry`
4. For callback handlers, register them in `callbackHandlerRegistry`

## Best Practices

- Always validate user input before processing
- Use clear, descriptive state names
- Keep handlers focused on a single responsibility
- Use the conversation context to store data between states
- Always provide clear feedback to users about what's happening
- Handle errors gracefully within each handler

## Security Considerations

- Never store sensitive information (like passwords or private keys) in the conversation context
- Always validate and sanitize user input
- Implement appropriate authorization checks in each handler
- Use secure defaults and provide clear security warnings for high-value operations 
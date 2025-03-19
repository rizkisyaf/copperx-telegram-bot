// Conversation states
export enum ConversationState {
  IDLE = 'IDLE',
  WAITING_FOR_EMAIL = 'WAITING_FOR_EMAIL',
  WAITING_FOR_OTP = 'WAITING_FOR_OTP',
  WAITING_FOR_RECIPIENT_EMAIL = 'WAITING_FOR_RECIPIENT_EMAIL',
  WAITING_FOR_SEND_AMOUNT = 'WAITING_FOR_SEND_AMOUNT',
  WAITING_FOR_SEND_CONFIRMATION = 'WAITING_FOR_SEND_CONFIRMATION',
  WAITING_FOR_WALLET_ADDRESS = 'WAITING_FOR_WALLET_ADDRESS',
  WAITING_FOR_WALLET_NETWORK = 'WAITING_FOR_WALLET_NETWORK',
  WAITING_FOR_WALLET_AMOUNT = 'WAITING_FOR_WALLET_AMOUNT',
  WAITING_FOR_WALLET_CONFIRMATION = 'WAITING_FOR_WALLET_CONFIRMATION',
  WAITING_FOR_BANK_ACCOUNT = 'WAITING_FOR_BANK_ACCOUNT',
  WAITING_FOR_BANK_AMOUNT = 'WAITING_FOR_BANK_AMOUNT',
  WAITING_FOR_BANK_CONFIRMATION = 'WAITING_FOR_BANK_CONFIRMATION',
  WAITING_FOR_DEFAULT_WALLET = 'WAITING_FOR_DEFAULT_WALLET',
}

// Transaction context to store information between conversation steps
export interface TransactionContext {
  recipientEmail?: string;
  amount?: string;
  walletAddress?: string;
  network?: string;
  bankAccountId?: string;
  walletId?: string;
}

// Class to manage conversation states
class ConversationManager {
  private states: Map<number, ConversationState> = new Map();
  private contexts: Map<number, TransactionContext> = new Map();

  // Get current state for a chat
  public getState(chatId: number): ConversationState {
    return this.states.get(chatId) || ConversationState.IDLE;
  }

  // Set state for a chat
  public setState(chatId: number, state: ConversationState): void {
    this.states.set(chatId, state);
  }

  // Get transaction context for a chat
  public getContext(chatId: number): TransactionContext {
    return this.contexts.get(chatId) || {};
  }

  // Set transaction context for a chat
  public setContext(chatId: number, context: TransactionContext): void {
    this.contexts.set(chatId, context);
  }

  // Update transaction context for a chat
  public updateContext(chatId: number, contextUpdate: Partial<TransactionContext>): void {
    const currentContext = this.getContext(chatId);
    this.contexts.set(chatId, { ...currentContext, ...contextUpdate });
  }

  // Clear state and context for a chat
  public clearChat(chatId: number): void {
    this.states.delete(chatId);
    this.contexts.delete(chatId);
  }

  // Reset to idle state but keep context
  public resetState(chatId: number): void {
    this.setState(chatId, ConversationState.IDLE);
  }
}

export default new ConversationManager(); 
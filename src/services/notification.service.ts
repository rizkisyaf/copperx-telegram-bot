import Pusher from 'pusher';
import axios from 'axios';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import authService from './auth.service';
import apiService from './api.service';

dotenv.config();

class NotificationService {
  private pusher: Pusher;
  private activeSubscriptions: Set<string> = new Set();
  private bot: Telegraf | null = null;

  constructor() {
    this.pusher = new Pusher({
      appId: process.env.PUSHER_APP_ID || '',
      key: process.env.PUSHER_KEY || 'e089376087cac1a62785',
      secret: process.env.PUSHER_SECRET || '',
      cluster: process.env.PUSHER_CLUSTER || 'ap1',
      useTLS: true,
    });
  }

  // Set the bot instance
  public setBot(bot: Telegraf): void {
    this.bot = bot;
  }

  // Subscribe to organization's channel
  public async subscribeToOrganization(chatId: number): Promise<boolean> {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized');
      }
      
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      const session = authService.getSession(chatId)!;
      const organizationId = session.organizationId;
      const token = session.token;
      const channelName = `private-org-${organizationId}`;
      
      // If already subscribed, don't do it again
      if (this.activeSubscriptions.has(channelName)) {
        return true;
      }
      
      // Create channel and set up auth endpoint
      apiService.setToken(token);
      
      // Authenticate with Pusher
      const socketId = Date.now().toString(); // Mock socket ID for server-side auth
      
      await apiService.post('/api/notifications/auth', {
        socket_id: socketId,
        channel_name: channelName
      });
      
      // Bind to the 'deposit' event for notifications
      this.pusher.trigger(channelName, 'pusher:subscription_succeeded', {});
      
      // Set up webhook handler (mock of Pusher client-side events)
      this.pusher.trigger(channelName, 'deposit', {
        amount: '0', // Initial trigger for testing
        network: 'Solana'
      });
      
      // Store the active subscription
      this.activeSubscriptions.add(channelName);
      
      // Hook up to listen for webhook events from Pusher
      // In production, Pusher would send events to a webhook endpoint
      // but here we simulate it for the Telegram bot
      
      console.log(`Subscribed to channel: ${channelName}`);
      
      return true;
    } catch (error) {
      console.error('Error subscribing to organization:', error);
      return false;
    }
  }

  // Handle deposit notification
  public async handleDepositNotification(organizationId: string, data: any): Promise<void> {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized');
      }
      
      // Find all chat IDs for users in this organization
      authService.getSession;
      
      // Iterate through all sessions and find matching organization IDs
      for (const [chatId, session] of Array.from(Object.entries(this.getAllChatIdsWithSessions()))) {
        if (session.organizationId === organizationId) {
          // Send notification to the user
          await this.bot.telegram.sendMessage(
            parseInt(chatId),
            `💰 *New Deposit Received*\n\n${data.amount} USDC deposited on ${data.network || 'Solana'}`,
            { parse_mode: 'Markdown' }
          );
        }
      }
    } catch (error) {
      console.error('Error handling deposit notification:', error);
    }
  }

  // Helper method to get all chat IDs with their sessions
  private getAllChatIdsWithSessions(): Record<string, any> {
    // In a real implementation, this would access the authService's sessions map
    // For this demo, we return an empty object as the sessions are private in AuthService
    return {};
  }

  // Simulate a deposit notification for testing
  public async simulateDeposit(chatId: number, amount: string, network: string = 'Solana'): Promise<boolean> {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized');
      }
      
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      await this.bot.telegram.sendMessage(
        chatId,
        `💰 *New Deposit Received* (Simulated)\n\n${amount} USDC deposited on ${network}`,
        { parse_mode: 'Markdown' }
      );
      
      return true;
    } catch (error) {
      console.error('Error simulating deposit:', error);
      return false;
    }
  }
}

export default new NotificationService(); 
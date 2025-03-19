import Pusher from 'pusher';
import PusherClient from 'pusher-js';
import axios from 'axios';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import authService from './auth.service';
import apiService from './api.service';
import { UserSession } from '../interfaces/user.interface';

dotenv.config();

interface DepositEvent {
  amount: string;
  network: string;
  txHash?: string;
  timestamp?: string;
  userId?: string;
  organizationId?: string;
}

class NotificationService {
  private pusher: Pusher;
  private pusherClient: PusherClient | null = null;
  private activeSubscriptions: Set<string> = new Set();
  private bot: Telegraf | null = null;
  private webhookEndpoint: string;

  constructor() {
    // Initialize Pusher server instance
    this.pusher = new Pusher({
      appId: process.env.PUSHER_APP_ID || '',
      key: process.env.PUSHER_KEY || '',
      secret: process.env.PUSHER_SECRET || '',
      cluster: process.env.PUSHER_CLUSTER || 'ap1',
      useTLS: true,
    });
    
    // Webhook endpoint for deposit notifications
    this.webhookEndpoint = process.env.WEBHOOK_ENDPOINT || '';
  }

  // Set the bot instance
  public setBot(bot: Telegraf): void {
    this.bot = bot;
  }

  // Initialize Pusher client
  private initPusherClient(token: string): PusherClient {
    // Initialize client-side Pusher instance if not done already
    if (!this.pusherClient) {
      this.pusherClient = new PusherClient(process.env.PUSHER_KEY || '', {
        cluster: process.env.PUSHER_CLUSTER || 'ap1',
        authEndpoint: `${process.env.COPPERX_API_URL}/api/notifications/auth`,
        auth: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      });
    }
    
    return this.pusherClient;
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
      
      // Initialize Pusher client with auth token
      const pusherClient = this.initPusherClient(token);
      
      // Subscribe to the private channel
      const channel = pusherClient.subscribe(channelName);
      
      // Bind to deposit event
      channel.bind('deposit', (data: DepositEvent) => {
        // Add organization ID to the data if not present
        if (!data.organizationId) {
          data.organizationId = organizationId;
        }
        
        // Handle the deposit notification
        this.handleDepositNotification(organizationId, data);
      });
      
      // Register webhook handler for server-side events
      if (this.webhookEndpoint) {
        try {
          await this.registerWebhook(organizationId, token);
        } catch (error: any) {
          console.error('Error registering webhook (continuing anyway):', error.message);
          // Non-fatal error, continue with client-side subscription
        }
      }
      
      // Store the active subscription
      this.activeSubscriptions.add(channelName);
      
      console.log(`Subscribed to channel: ${channelName}`);
      
      await this.bot.telegram.sendMessage(
        chatId,
        '✅ Successfully subscribed to deposit notifications!'
      );
      
      return true;
    } catch (error: any) {
      console.error('Error subscribing to organization:', error);
      
      if (this.bot) {
        try {
          await this.bot.telegram.sendMessage(
            chatId,
            `⚠️ Failed to subscribe to notifications: ${error.message}`
          );
        } catch (e) {
          console.error('Error sending error message to user:', e);
        }
      }
      
      return false;
    }
  }

  // Register webhook with Copperx API
  private async registerWebhook(organizationId: string, token: string): Promise<void> {
    if (!this.webhookEndpoint) {
      throw new Error('Webhook endpoint not configured');
    }
    
    apiService.setToken(token);
    
    await apiService.post('/api/webhooks/register', {
      url: this.webhookEndpoint,
      events: ['deposit'],
      organizationId: organizationId
    });
    
    console.log(`Registered webhook for organization: ${organizationId}`);
  }

  // Handle webhook request from outside (e.g., Express endpoint)
  public async handleWebhookRequest(payload: any): Promise<boolean> {
    try {
      if (!payload || !payload.event || !payload.data) {
        throw new Error('Invalid webhook payload');
      }
      
      const { event, data } = payload;
      
      if (event === 'deposit' && data.organizationId) {
        await this.handleDepositNotification(data.organizationId, data);
        return true;
      }
      
      return false;
    } catch (error: any) {
      console.error('Error handling webhook request:', error);
      return false;
    }
  }

  // Handle deposit notification
  public async handleDepositNotification(organizationId: string, data: DepositEvent): Promise<void> {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized');
      }
      
      // Find all chat IDs for users in this organization
      const userSessions = authService.getAllSessionsByOrganization(organizationId);
      
      // Format the message
      const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleString() : new Date().toLocaleString();
      let message = `💰 *New Deposit Received*\n\n`;
      message += `Amount: ${data.amount} USDC\n`;
      message += `Network: ${data.network || 'Solana'}\n`;
      
      if (data.txHash) {
        message += `Transaction: \`${data.txHash}\`\n`;
      }
      
      message += `Time: ${timestamp}`;
      
      // Iterate through all sessions and find matching organization IDs
      for (const [chatId, session] of Object.entries(userSessions)) {
        // Send notification to the user
        await this.bot.telegram.sendMessage(
          parseInt(chatId),
          message,
          { parse_mode: 'Markdown' }
        );
        
        console.log(`Sent deposit notification to chat ID: ${chatId}`);
      }
      
      console.log(`Processed deposit notification for organization: ${organizationId}`);
    } catch (error: any) {
      console.error('Error handling deposit notification:', error);
    }
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
      
      const session = authService.getSession(chatId)!;
      const organizationId = session.organizationId;
      
      // Create a realistic deposit event
      const depositEvent: DepositEvent = {
        amount,
        network,
        txHash: `${network.toLowerCase()}_${Date.now().toString(16)}`,
        timestamp: new Date().toISOString(),
        organizationId
      };
      
      // In a development environment, we'll handle it directly
      if (process.env.NODE_ENV === 'development') {
        await this.handleDepositNotification(organizationId, depositEvent);
        return true;
      }
      
      // In production, trigger the event through Pusher
      try {
        // Only if we have proper Pusher credentials
        if (process.env.PUSHER_APP_ID && process.env.PUSHER_SECRET) {
          await this.pusher.trigger(
            `private-org-${organizationId}`,
            'deposit',
            depositEvent
          );
          return true;
        } else {
          // Fall back to direct handling if no Pusher credentials
          await this.handleDepositNotification(organizationId, depositEvent);
          return true;
        }
      } catch (error: any) {
        console.error('Error triggering Pusher event:', error);
        
        // Fall back to direct handling
        await this.handleDepositNotification(organizationId, depositEvent);
        return true;
      }
    } catch (error: any) {
      console.error('Error simulating deposit:', error);
      
      if (this.bot) {
        try {
          await this.bot.telegram.sendMessage(
            chatId,
            `⚠️ Failed to simulate deposit: ${error.message}`
          );
        } catch (e) {
          console.error('Error sending error message to user:', e);
        }
      }
      
      return false;
    }
  }
}

export default new NotificationService(); 
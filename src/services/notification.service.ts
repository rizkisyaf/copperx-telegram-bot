import Pusher from 'pusher';
import PusherClient from 'pusher-js';
import axios from 'axios';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import authService from './auth.service';
import apiService from './api.service';
import { Context } from '../interfaces/context.interface';

dotenv.config();

interface DepositEvent {
  amount: string;
  network: string;
  txHash?: string;
  timestamp?: string;
  userId?: string;
  organizationId?: string;
}

// Store mapping of organization IDs to user chat IDs
interface OrganizationMapping {
  [organizationId: string]: {
    chatId: number;
    token: string;
    lastNotified?: number;
  }[];
}

class NotificationService {
  private pusher: Pusher;
  private pusherClient: PusherClient | null = null;
  private activeSubscriptions: Set<string> = new Set();
  private bot: Telegraf<any> | null = null;
  private webhookEndpoint: string;
  private orgToUserMapping: OrganizationMapping = {};
  private refreshInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts: Map<string, number> = new Map();
  private maxReconnectAttempts = 5;
  private userChatIds: Map<number, { organizationId: string; token: string }> = new Map();

  constructor() {
    // Initialize Pusher server instance with proper error handling
    try {
      this.pusher = new Pusher({
        appId: process.env.PUSHER_APP_ID || '',
        key: process.env.PUSHER_KEY || '',
        secret: process.env.PUSHER_SECRET || '',
        cluster: process.env.PUSHER_CLUSTER || 'ap1',
        useTLS: true,
      });
    } catch (error) {
      console.error('Failed to initialize Pusher server instance:', error);
      // Initialize with empty values to prevent runtime errors
      this.pusher = new Pusher({
        appId: '',
        key: '',
        secret: '',
        cluster: 'ap1',
        useTLS: true,
      });
    }
    
    // Webhook endpoint for deposit notifications
    this.webhookEndpoint = process.env.WEBHOOK_ENDPOINT || '';
    
    // Start regular mapping refresh
    this.startOrgMappingRefresh();
  }

  // Set the bot instance
  public setBot(bot: Telegraf<any>): void {
    this.bot = bot;
    
    // When bot is set, refresh org mapping
    this.refreshOrgMappings();
  }

  /**
   * Start periodic refresh of organization mapping
   * This ensures the bot has up-to-date information about which users belong to which organizations
   */
  private startOrgMappingRefresh(): void {
    // Refresh mapping every 15 minutes
    const refreshInterval = 15 * 60 * 1000;
    
    this.refreshInterval = setInterval(() => {
      this.refreshOrgMappings();
    }, refreshInterval);
  }

  /**
   * Stop the organization mapping refresh interval
   */
  public stopOrgMappingRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Add a user to the organization mapping
   * @param chatId The user's chat ID
   * @param organizationId The organization ID
   * @param token The user's auth token
   */
  public addUserToMapping(chatId: number, organizationId: string, token: string): void {
    this.userChatIds.set(chatId, { organizationId, token });
    // Refresh mappings to include this user
    this.refreshOrgMappings();
  }

  /**
   * Remove a user from the organization mapping
   * @param chatId The user's chat ID
   */
  public removeUserFromMapping(chatId: number): void {
    this.userChatIds.delete(chatId);
    // Refresh mappings to remove this user
    this.refreshOrgMappings();
  }

  /**
   * Build mapping of organization IDs to chat IDs
   * This ensures notifications can be delivered to the right users
   */
  private async refreshOrgMappings(): Promise<void> {
    try {
      // Create a new mapping
      const newMapping: OrganizationMapping = {};
      
      // Iterate over all known user chat IDs
      for (const [chatId, userData] of this.userChatIds.entries()) {
        // Skip if not authenticated
        if (!authService.isAuthenticated(chatId)) {
          continue;
        }
        
        const { organizationId, token } = userData;
        
        // Only include sessions with organization IDs and tokens
        if (organizationId && token) {
          if (!newMapping[organizationId]) {
            newMapping[organizationId] = [];
          }
          
          // Copy over the lastNotified timestamp if it exists in the current mapping
          let lastNotified = undefined;
          if (
            this.orgToUserMapping[organizationId] &&
            this.orgToUserMapping[organizationId].some(u => u.chatId === chatId)
          ) {
            const existing = this.orgToUserMapping[organizationId].find(
              u => u.chatId === chatId
            );
            if (existing) {
              lastNotified = existing.lastNotified;
            }
          }
          
          newMapping[organizationId].push({
            chatId,
            token,
            lastNotified
          });
        }
      }
      
      // Update the mapping
      this.orgToUserMapping = newMapping;
      
      // Ensure all organizations have active subscriptions
      this.ensureAllOrgsSubscribed();
      
      console.log(`Refreshed organization mappings. Found ${Object.keys(this.orgToUserMapping).length} organizations.`);
    } catch (error) {
      console.error('Failed to refresh organization mappings:', error);
    }
  }

  /**
   * Ensure all known organizations have active subscriptions
   */
  private async ensureAllOrgsSubscribed(): Promise<void> {
    for (const [orgId, users] of Object.entries(this.orgToUserMapping)) {
      if (users.length > 0 && !this.activeSubscriptions.has(`private-org-${orgId}`)) {
        // Use the first user's credentials to subscribe
        const user = users[0];
        await this.subscribeToOrganizationInternal(orgId, user.token, user.chatId);
      }
    }
  }

  // Initialize Pusher client with comprehensive error handling
  private initPusherClient(token: string): PusherClient {
    try {
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
        
        // Setup global Pusher client error handling
        this.pusherClient.connection.bind('error', (err: any) => {
          console.error('Pusher client connection error:', err);
        });
        
        this.pusherClient.connection.bind('disconnected', () => {
          console.warn('Pusher client disconnected. Will attempt to reconnect automatically.');
        });
        
        this.pusherClient.connection.bind('connected', () => {
          console.log('Pusher client connected successfully.');
        });
      }
      
      return this.pusherClient;
    } catch (error) {
      console.error('Failed to initialize Pusher client:', error);
      throw new Error('Failed to initialize notification service. Please try again later.');
    }
  }

  /**
   * Subscribe to organization's private channel
   * @param chatId The chat ID of the user requesting the subscription
   */
  public async subscribeToOrganization(chatId: number): Promise<boolean> {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized');
      }
      
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      const session = authService.getSession(chatId)!;
      if (!session.organizationId || !session.token) {
        throw new Error('Invalid user session data');
      }
      
      // Store user in our local mapping
      this.addUserToMapping(chatId, session.organizationId, session.token);
      
      // Subscribe to the organization's channel
      const result = await this.subscribeToOrganizationInternal(
        session.organizationId, 
        session.token, 
        chatId
      );
      
      // Notify the user of success
      if (result) {
        await this.bot.telegram.sendMessage(
          chatId,
          '✅ Successfully subscribed to deposit notifications!'
        );
      }
      
      return result;
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
  
  /**
   * Internal method to subscribe to an organization's channel
   * @param organizationId The organization ID
   * @param token Authentication token
   * @param chatId Chat ID for logging (optional)
   */
  private async subscribeToOrganizationInternal(
    organizationId: string, 
    token: string,
    chatId?: number
  ): Promise<boolean> {
    try {
      const channelName = `private-org-${organizationId}`;
      
      // If already subscribed, don't do it again
      if (this.activeSubscriptions.has(channelName)) {
        return true;
      }
      
      // Initialize Pusher client with auth token
      const pusherClient = this.initPusherClient(token);
      
      // Subscribe to the private channel
      const channel = pusherClient.subscribe(channelName);
      
      // Reset reconnect attempts for this channel
      this.reconnectAttempts.set(channelName, 0);
      
      // Bind to deposit event
      channel.bind('deposit', (data: DepositEvent) => {
        // Add organization ID to the data if not present
        if (!data.organizationId) {
          data.organizationId = organizationId;
        }
        
        // Handle the deposit notification
        this.handleDepositNotification(organizationId, data);
      });
      
      // Bind to connection and subscription events for logging
      channel.bind('pusher:subscription_succeeded', () => {
        console.log(`Successfully subscribed to ${channelName}`);
        this.activeSubscriptions.add(channelName);
        
        // Register webhook if endpoint is configured
        if (this.webhookEndpoint) {
          this.registerWebhook(organizationId, token).catch((error: any) => {
            console.error('Error registering webhook:', error);
          });
        }
      });
      
      channel.bind('pusher:subscription_error', (error: any) => {
        console.error(`Error subscribing to ${channelName}:`, error);
        
        // Handle automatic reconnection with exponential backoff
        const attempts = this.reconnectAttempts.get(channelName) || 0;
        if (attempts < this.maxReconnectAttempts) {
          const backoffMs = Math.min(30000, Math.pow(2, attempts) * 1000);
          console.log(`Will retry subscription to ${channelName} in ${backoffMs}ms (attempt ${attempts + 1}/${this.maxReconnectAttempts})`);
          
          this.reconnectAttempts.set(channelName, attempts + 1);
          
          setTimeout(() => {
            if (!this.activeSubscriptions.has(channelName)) {
              this.subscribeToOrganizationInternal(organizationId, token, chatId);
            }
          }, backoffMs);
        }
      });
      
      return true;
    } catch (error: any) {
      console.error('Error setting up Pusher subscription:', error);
      return false;
    }
  }
  
  /**
   * Register webhook for deposit notifications
   * @param organizationId Organization ID
   * @param token Authentication token
   */
  private async registerWebhook(organizationId: string, token: string): Promise<void> {
    try {
      if (!this.webhookEndpoint) {
        throw new Error('Webhook endpoint not configured');
      }
      
      // Set up webhook registration
      await apiService.post(
        '/api/notifications/webhook',
        {
          url: this.webhookEndpoint,
          events: ['deposit'],
          organizationId
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      
      console.log(`Webhook registered for organization ${organizationId}`);
    } catch (error: any) {
      console.error('Error registering webhook:', error);
      throw error;
    }
  }
  
  /**
   * Handle webhook requests from Copperx API
   * @param payload Webhook payload
   */
  public async handleWebhookRequest(payload: any): Promise<boolean> {
    try {
      // Validate the payload
      if (!payload || !payload.event || !payload.data) {
        throw new Error('Invalid webhook payload');
      }
      
      // Process different event types
      const { event, data } = payload;
      
      if (event === 'deposit') {
        // Handle deposit event
        const { organizationId, ...depositData } = data;
        
        if (!organizationId) {
          throw new Error('Missing organizationId in deposit event');
        }
        
        await this.handleDepositNotification(organizationId, depositData);
        return true;
      }
      
      // Unknown event type
      console.warn(`Received unknown webhook event: ${event}`);
      return false;
    } catch (error: any) {
      console.error('Error processing webhook:', error);
      return false;
    }
  }
  
  /**
   * Handle deposit notification
   * @param organizationId Organization ID
   * @param data Deposit event data
   */
  public async handleDepositNotification(organizationId: string, data: DepositEvent): Promise<void> {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized');
      }
      
      // Format notification message
      const message = this.formatDepositMessage(data);
      
      // Get all users in the organization from our mapping
      const orgUsers = this.orgToUserMapping[organizationId] || [];
      
      if (orgUsers.length === 0) {
        console.log(`No users found for organization ${organizationId}. Refreshing mappings...`);
        await this.refreshOrgMappings();
        
        // Check again after refresh
        const refreshedOrgUsers = this.orgToUserMapping[organizationId] || [];
        if (refreshedOrgUsers.length === 0) {
          console.log(`Still no users found for organization ${organizationId} after refresh.`);
          return;
        }
      }
      
      // Rate limiting: don't send notifications too frequently to the same user
      const now = Date.now();
      const minInterval = 5 * 1000; // 5 seconds between notifications
      
      // Send notification to all organization users
      for (const user of this.orgToUserMapping[organizationId] || []) {
        try {
          // Rate limit check
          if (user.lastNotified && now - user.lastNotified < minInterval) {
            console.log(`Skipping notification to chat ${user.chatId} due to rate limiting`);
            continue;
          }
          
          await this.bot.telegram.sendMessage(user.chatId, message, { parse_mode: 'Markdown' });
          console.log(`Deposit notification sent to chat ${user.chatId}`);
          
          // Update last notified timestamp
          user.lastNotified = now;
        } catch (error: any) {
          console.error(`Error sending notification to chat ${user.chatId}:`, error);
          
          // Check if user blocked the bot or chat not found
          if (
            error.description &&
            (error.description.includes('blocked') || error.description.includes('chat not found'))
          ) {
            console.log(`Removing chat ${user.chatId} from organization ${organizationId} due to blocked/deleted chat`);
            // Remove this user from the mapping
            this.orgToUserMapping[organizationId] = this.orgToUserMapping[organizationId].filter(
              u => u.chatId !== user.chatId
            );
          }
        }
      }
    } catch (error: any) {
      console.error('Error handling deposit notification:', error);
    }
  }
  
  /**
   * Format deposit notification message
   * @param data Deposit event data
   */
  private formatDepositMessage(data: DepositEvent): string {
    return `💰 *New Deposit Received*\n\n` +
      `Amount: *${data.amount} USDC*\n` +
      `Network: *${data.network}*\n` +
      `${data.txHash ? `Transaction: \`${data.txHash}\`\n` : ''}` +
      `${data.timestamp ? `Time: ${new Date(data.timestamp).toLocaleString()}\n` : ''}`;
  }
  
  /**
   * Simulate a deposit (for testing purposes)
   * @param chatId Chat ID of the user
   * @param amount Amount to simulate
   * @param network Network to simulate (default: Solana)
   */
  public async simulateDeposit(chatId: number, amount: string, network: string = 'Solana'): Promise<boolean> {
    try {
      if (!authService.isAuthenticated(chatId)) {
        throw new Error('User not authenticated');
      }
      
      const session = authService.getSession(chatId)!;
      if (!session.organizationId) {
        throw new Error('User session missing organization ID');
      }
      
      // Create realistic mock deposit data
      const depositData: DepositEvent = {
        amount,
        network,
        txHash: `${network.toLowerCase()}_${Date.now().toString(16)}`,
        timestamp: new Date().toISOString(),
        organizationId: session.organizationId
      };
      
      // In development environment, trigger directly through the handler
      if (process.env.NODE_ENV === 'development') {
        await this.handleDepositNotification(session.organizationId, depositData);
        return true;
      }
      
      // In production, trigger the event through Pusher for realism
      try {
        // Only if we have proper Pusher credentials
        if (process.env.PUSHER_APP_ID && process.env.PUSHER_SECRET) {
          await this.pusher.trigger(
            `private-org-${session.organizationId}`,
            'deposit',
            depositData
          );
          console.log(`Simulated deposit event triggered via Pusher for organization ${session.organizationId}`);
          return true;
        } else {
          // Fall back to direct handling if no Pusher credentials
          await this.handleDepositNotification(session.organizationId, depositData);
          return true;
        }
      } catch (error: any) {
        console.error('Error triggering Pusher event:', error);
        
        // Fall back to direct handling
        await this.handleDepositNotification(session.organizationId, depositData);
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
  
  /**
   * Clean up resources
   */
  public shutdown(): void {
    this.stopOrgMappingRefresh();
    
    // Unsubscribe from all channels
    if (this.pusherClient) {
      for (const channel of this.activeSubscriptions) {
        try {
          this.pusherClient.unsubscribe(channel);
          console.log(`Unsubscribed from ${channel}`);
        } catch (error) {
          console.error(`Error unsubscribing from ${channel}:`, error);
        }
      }
      
      try {
        this.pusherClient.disconnect();
        console.log('Pusher client disconnected');
      } catch (error) {
        console.error('Error disconnecting Pusher client:', error);
      }
    }
  }
}

export default new NotificationService(); 
import lowdb from 'lowdb';
import FileSync from 'lowdb/adapters/FileSync';
import { UserSession, OTPRequest } from '../interfaces/user.interface';
import path from 'path';
import fs from 'fs';

// Define the database schema
interface DatabaseSchema {
  sessions: Record<string, UserSession>;
  otpRequests: Record<string, OTPRequest & { expires: Date }>;
  lastCleanup?: Date;
}

class DatabaseService {
  private db: lowdb.LowdbSync<DatabaseSchema>;
  private dbPath: string;
  private backupDir: string;
  private cleanupInterval: number = 1000 * 60 * 60; // Hourly cleanup

  constructor() {
    // Create data directory if it doesn't exist
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    this.dbPath = path.join(dataDir, 'db.json');
    this.backupDir = path.join(dataDir, 'backups');
    
    // Create backup directory if it doesn't exist
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
    
    const adapter = new FileSync<DatabaseSchema>(this.dbPath);
    this.db = lowdb(adapter);
    
    // Initialize the database with default values if empty
    this.db.defaults({ sessions: {}, otpRequests: {} }).write();
    
    // Schedule regular cleanup
    this.scheduleCleanup();
    
    // Create initial backup
    this.createBackup();
  }

  // User sessions
  public saveSession(chatId: number, session: UserSession): void {
    this.db.set(`sessions.${chatId}`, session).write();
  }

  public getSession(chatId: number): UserSession | undefined {
    return this.db.get(`sessions.${chatId}`).value();
  }

  public deleteSession(chatId: number): void {
    this.db.unset(`sessions.${chatId}`).write();
  }
  
  public getAllSessions(): Record<string, UserSession> {
    return this.db.get('sessions').value();
  }

  // OTP requests
  public saveOTPRequest(chatId: number, request: OTPRequest): void {
    const otpRequest = { 
      ...request, 
      expires: new Date(Date.now() + 5 * 60 * 1000) // OTP valid for 5 minutes
    };
    this.db.set(`otpRequests.${chatId}`, otpRequest).write();
  }

  public getOTPRequest(chatId: number): (OTPRequest & { expires: Date }) | undefined {
    const request = this.db.get(`otpRequests.${chatId}`).value();
    
    if (!request) {
      return undefined;
    }
    
    // Parse date string back to Date object if needed
    if (typeof request.expires === 'string') {
      request.expires = new Date(request.expires);
    }
    
    // Check if OTP has expired
    if (request.expires < new Date()) {
      this.deleteOTPRequest(chatId);
      return undefined;
    }
    
    return request;
  }

  public deleteOTPRequest(chatId: number): void {
    this.db.unset(`otpRequests.${chatId}`).write();
  }

  // Clean up expired data
  public cleanupExpiredData(): void {
    console.log('Running database cleanup...');
    const now = new Date();
    
    // Clean expired sessions
    const sessions = this.db.get('sessions').value();
    for (const [chatId, session] of Object.entries(sessions)) {
      if (new Date(session.expires) < now) {
        this.deleteSession(parseInt(chatId));
        console.log(`Cleaned expired session for chat ID: ${chatId}`);
      }
    }
    
    // Clean expired OTP requests
    const otpRequests = this.db.get('otpRequests').value();
    for (const [chatId, request] of Object.entries(otpRequests)) {
      if (new Date(request.expires) < now) {
        this.deleteOTPRequest(parseInt(chatId));
        console.log(`Cleaned expired OTP request for chat ID: ${chatId}`);
      }
    }
    
    // Update last cleanup timestamp
    this.db.set('lastCleanup', now).write();
  }
  
  // Schedule automatic cleanup
  private scheduleCleanup(): void {
    // First, check when the last cleanup was performed
    const lastCleanup = this.db.get('lastCleanup').value();
    const now = new Date();
    
    // If last cleanup is too old or doesn't exist, run cleanup immediately
    if (!lastCleanup || (now.getTime() - new Date(lastCleanup).getTime() > this.cleanupInterval)) {
      this.cleanupExpiredData();
    }
    
    // Schedule regular cleanup
    setInterval(() => {
      this.cleanupExpiredData();
    }, this.cleanupInterval);
    
    console.log('Database cleanup scheduled');
  }
  
  // Create a database backup
  public createBackup(): boolean {
    try {
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
      const backupPath = path.join(this.backupDir, `db_backup_${timestamp}.json`);
      
      // Read the current database content
      const data = fs.readFileSync(this.dbPath, 'utf8');
      
      // Write it to the backup file
      fs.writeFileSync(backupPath, data);
      
      console.log(`Database backup created at ${backupPath}`);
      
      // Cleanup old backups (keep last 10)
      this.cleanupOldBackups();
      
      return true;
    } catch (error) {
      console.error('Failed to create database backup:', error);
      return false;
    }
  }
  
  // Clean up old backups, keeping only the most recent ones
  private cleanupOldBackups(): void {
    try {
      // Get all backup files
      const files = fs.readdirSync(this.backupDir)
        .filter(file => file.startsWith('db_backup_'))
        .map(file => ({
          name: file,
          path: path.join(this.backupDir, file),
          mtime: fs.statSync(path.join(this.backupDir, file)).mtime
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      
      // Keep only the latest 10 backups
      const filesToDelete = files.slice(10);
      
      // Delete older backups
      for (const file of filesToDelete) {
        fs.unlinkSync(file.path);
        console.log(`Deleted old backup: ${file.name}`);
      }
    } catch (error) {
      console.error('Failed to cleanup old backups:', error);
    }
  }
}

export default new DatabaseService(); 
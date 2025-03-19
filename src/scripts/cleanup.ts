import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import databaseService from '../services/database.service';

// Define directory paths
const DATA_DIR = path.join(process.cwd(), 'data');
const LOGS_DIR = path.join(process.cwd(), 'logs');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// Parse command line arguments
const args = process.argv.slice(2);
const force = args.includes('--force') || args.includes('-f');
const logs = args.includes('--logs') || args.includes('-l');
const backups = args.includes('--backups') || args.includes('-b');
const dryRun = args.includes('--dry-run') || args.includes('-d');

// Function to clean up database
async function cleanupDatabase() {
  console.log('Cleaning up database...');

  if (dryRun) {
    console.log('[DRY RUN] Would clean up expired sessions and OTP requests');
    return;
  }

  try {
    // Clean up expired data using database service
    databaseService.cleanupExpiredData();
    console.log('Database cleanup completed successfully.');
  } catch (error) {
    console.error('Database cleanup failed:', error);
    if (!force) {
      process.exit(1);
    }
  }
}

// Function to clean up log files
async function cleanupLogs(days: number = 30) {
  if (!logs) {
    return;
  }

  console.log(`Cleaning up log files older than ${days} days...`);

  if (!fs.existsSync(LOGS_DIR)) {
    console.log('Logs directory does not exist. Skipping log cleanup.');
    return;
  }

  if (dryRun) {
    console.log(`[DRY RUN] Would clean up log files older than ${days} days in ${LOGS_DIR}`);
    return;
  }

  try {
    // Get all log files
    const logFiles = fs.readdirSync(LOGS_DIR)
      .filter(file => file.endsWith('.log'))
      .map(file => ({
        name: file,
        path: path.join(LOGS_DIR, file),
        mtime: fs.statSync(path.join(LOGS_DIR, file)).mtime
      }));

    // Calculate cutoff date
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));

    // Delete old log files
    let deletedCount = 0;
    for (const file of logFiles) {
      if (file.mtime < cutoffDate) {
        fs.unlinkSync(file.path);
        deletedCount++;
        console.log(`Deleted old log file: ${file.name}`);
      }
    }

    // Rotate current logs by renaming them and creating empty ones
    const currentLogs = ['error.log', 'output.log'];
    for (const logName of currentLogs) {
      const logPath = path.join(LOGS_DIR, logName);
      if (fs.existsSync(logPath)) {
        // Check file size
        const stats = fs.statSync(logPath);
        if (stats.size > 10 * 1024 * 1024) { // 10MB
          const rotatedName = `${logName}.${now.toISOString().replace(/:/g, '-')}`;
          fs.renameSync(logPath, path.join(LOGS_DIR, rotatedName));
          fs.writeFileSync(logPath, ''); // Create empty file
          console.log(`Rotated log file: ${logName} -> ${rotatedName}`);
        }
      }
    }

    console.log(`Logs cleanup completed. Deleted ${deletedCount} old log files.`);
  } catch (error) {
    console.error('Logs cleanup failed:', error);
    if (!force) {
      process.exit(1);
    }
  }
}

// Function to clean up old backups
async function cleanupBackups(count: number = 10) {
  if (!backups) {
    return;
  }

  console.log(`Cleaning up old backups, keeping the latest ${count}...`);

  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('Backups directory does not exist. Skipping backup cleanup.');
    return;
  }

  if (dryRun) {
    console.log(`[DRY RUN] Would clean up old backups, keeping the latest ${count}`);
    return;
  }

  try {
    // Clean up old backups manually
    // Get all backup files
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(file => file.startsWith('db_backup_'))
      .map(file => ({
        name: file,
        path: path.join(BACKUP_DIR, file),
        mtime: fs.statSync(path.join(BACKUP_DIR, file)).mtime
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    
    // Keep only the latest 'count' backups
    const filesToDelete = files.slice(count);
    
    // Delete older backups
    for (const file of filesToDelete) {
      fs.unlinkSync(file.path);
      console.log(`Deleted old backup: ${file.name}`);
    }

    console.log('Backups cleanup completed successfully.');
  } catch (error) {
    console.error('Backups cleanup failed:', error);
    if (!force) {
      process.exit(1);
    }
  }
}

// Function to optimize the database
async function optimizeDatabase() {
  console.log('Optimizing database...');

  if (dryRun) {
    console.log('[DRY RUN] Would optimize database');
    return;
  }

  try {
    // Create a backup before optimization
    console.log('Creating backup before optimization...');
    databaseService.createBackup();

    // Compact the database (depends on your database implementation)
    // For JSON files, we can read, parse, and write it back
    const dbPath = path.join(DATA_DIR, 'db.json');
    if (fs.existsSync(dbPath)) {
      console.log('Compacting database...');
      const data = fs.readFileSync(dbPath, 'utf8');
      const parsedData = JSON.parse(data);
      fs.writeFileSync(dbPath, JSON.stringify(parsedData, null, 2));
    }

    console.log('Database optimization completed successfully.');
  } catch (error) {
    console.error('Database optimization failed:', error);
    if (!force) {
      process.exit(1);
    }
  }
}

// Display help message if requested
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Database and Logs Cleanup Utility

Usage:
  node cleanup.js [options]

Options:
  -l, --logs             Clean up log files
  -b, --backups          Clean up old backups
  -f, --force            Continue even if errors occur
  -d, --dry-run          Show what would be done without making changes
  -h, --help             Display this help message

Examples:
  node cleanup.js                 Clean up only the database
  node cleanup.js -l              Clean up database and logs
  node cleanup.js -l -b           Clean up database, logs, and old backups
  node cleanup.js -l -b -f        Force cleanup of all components
  node cleanup.js --dry-run       Show what would be cleaned up without making changes
  `);
  process.exit(0);
}

// Main function to run all cleanup tasks
async function runCleanup() {
  console.log('Starting cleanup process...');
  
  try {
    // Clean up database
    await cleanupDatabase();
    
    // Clean up logs if requested
    await cleanupLogs();
    
    // Clean up old backups if requested
    await cleanupBackups();
    
    // Optimize database
    await optimizeDatabase();
    
    console.log('All cleanup tasks completed successfully.');
  } catch (error) {
    console.error('Cleanup process failed:', error);
    process.exit(1);
  }
}

// Run cleanup
runCleanup(); 
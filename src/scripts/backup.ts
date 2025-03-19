import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import databaseService from '../services/database.service';

const DATA_DIR = path.join(process.cwd(), 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Parse command line arguments
const args = process.argv.slice(2);
const compress = args.includes('--compress') || args.includes('-c');
const remote = args.includes('--remote') || args.includes('-r');
const remotePath = args.find((arg, index) => 
  (arg === '--path' || arg === '-p') && args[index + 1]
) ? args[args.indexOf(args.find((arg) => arg === '--path' || arg === '-p')!) + 1] : null;

// Function to create backup
async function createBackup() {
  console.log('Creating database backup...');
  
  try {
    // Create backup using database service
    const backupSuccess = databaseService.createBackup();
    
    if (!backupSuccess) {
      throw new Error('Database backup failed');
    }
    
    console.log('Database backup created successfully.');
    
    // Compress backup if requested
    if (compress) {
      await compressBackups();
    }
    
    // Copy to remote location if requested
    if (remote && remotePath) {
      await copyToRemote(remotePath);
    }
    
    console.log('Backup process completed successfully.');
  } catch (error) {
    console.error('Backup failed:', error);
    process.exit(1);
  }
}

// Function to compress backups
function compressBackups(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('Compressing backups...');
    
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const archiveName = `backups_${timestamp}.tar.gz`;
    const archivePath = path.join(DATA_DIR, archiveName);
    
    // Create tar.gz of the backup directory
    exec(`tar -czf "${archivePath}" -C "${DATA_DIR}" backups`, (error) => {
      if (error) {
        console.error('Compression failed:', error);
        reject(error);
        return;
      }
      
      console.log(`Backups compressed to ${archivePath}`);
      resolve();
    });
  });
}

// Function to copy backups to remote location
function copyToRemote(remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`Copying backups to remote location: ${remotePath}`);
    
    // Copy backups directory to remote location
    exec(`cp -r "${BACKUP_DIR}" "${remotePath}"`, (error) => {
      if (error) {
        console.error('Remote copy failed:', error);
        reject(error);
        return;
      }
      
      console.log(`Backups copied to ${remotePath}`);
      resolve();
    });
  });
}

// Display help message if requested
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Database Backup Utility

Usage:
  node backup.js [options]

Options:
  -c, --compress          Compress backups into tar.gz archive
  -r, --remote            Copy backups to remote location
  -p, --path <path>       Remote path for backup copies
  -h, --help              Display this help message

Examples:
  node backup.js                         Create a standard backup
  node backup.js -c                      Create and compress backup
  node backup.js -r -p /mnt/backups      Create backup and copy to /mnt/backups
  node backup.js -c -r -p /mnt/backups   Create, compress, and copy backup
  `);
  process.exit(0);
}

// Run backup
createBackup(); 
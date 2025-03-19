import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import { exec } from 'child_process';

// Load environment variables
dotenv.config();

// Define required environment variables
const REQUIRED_ENV_VARS = [
  'BOT_TOKEN',
  'COPPERX_API_URL',
  'PUSHER_APP_ID',
  'PUSHER_KEY',
  'PUSHER_SECRET',
  'PUSHER_CLUSTER'
];

// Define required directories
const REQUIRED_DIRS = [
  'data',
  'logs'
];

// Define colors for console output
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

// Function to print colored messages
function printMessage(message: string, color: keyof typeof COLORS, isError = false): void {
  const output = `${COLORS[color]}${message}${COLORS.reset}`;
  if (isError) {
    console.error(output);
  } else {
    console.log(output);
  }
}

// Function to check environment variables
async function checkEnvironmentVariables(): Promise<boolean> {
  printMessage('\nChecking environment variables...', 'blue');
  
  const missingVars: string[] = [];
  
  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      missingVars.push(envVar);
    }
  }
  
  if (missingVars.length > 0) {
    printMessage(`❌ Missing required environment variables: ${missingVars.join(', ')}`, 'red', true);
    printMessage('   Please add these variables to your .env file', 'yellow');
    return false;
  }
  
  printMessage('✅ All required environment variables are set', 'green');
  return true;
}

// Function to check required directories
async function checkDirectories(): Promise<boolean> {
  printMessage('\nChecking required directories...', 'blue');
  
  const missingDirs: string[] = [];
  
  for (const dir of REQUIRED_DIRS) {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) {
      missingDirs.push(dir);
      
      // Create the directory
      try {
        fs.mkdirSync(dirPath, { recursive: true });
        printMessage(`📁 Created missing directory: ${dir}`, 'yellow');
      } catch (error) {
        printMessage(`❌ Failed to create directory: ${dir}`, 'red', true);
      }
    }
  }
  
  if (missingDirs.length > 0) {
    printMessage('⚠️ Some required directories were missing but have been created', 'yellow');
  } else {
    printMessage('✅ All required directories exist', 'green');
  }
  
  return true;
}

// Function to check API connectivity
async function checkApiConnectivity(): Promise<boolean> {
  printMessage('\nChecking API connectivity...', 'blue');
  
  const apiUrl = process.env.COPPERX_API_URL;
  if (!apiUrl) {
    printMessage('❌ COPPERX_API_URL is not set', 'red', true);
    return false;
  }
  
  try {
    const response = await axios.get(`${apiUrl}/health`, { timeout: 5000 });
    
    if (response.status === 200) {
      printMessage('✅ API is reachable', 'green');
      return true;
    } else {
      printMessage(`❌ API returned status code: ${response.status}`, 'red', true);
      return false;
    }
  } catch (error: any) {
    printMessage(`❌ Failed to connect to API: ${error.message}`, 'red', true);
    return false;
  }
}

// Function to check database
async function checkDatabase(): Promise<boolean> {
  printMessage('\nChecking database...', 'blue');
  
  const dbPath = path.join(process.cwd(), 'data', 'db.json');
  
  if (!fs.existsSync(dbPath)) {
    printMessage('⚠️ Database file does not exist. It will be created when the bot starts.', 'yellow');
    return true;
  }
  
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    JSON.parse(data); // Make sure it's valid JSON
    printMessage('✅ Database file exists and is valid', 'green');
    return true;
  } catch (error) {
    printMessage('❌ Database file exists but is not valid JSON', 'red', true);
    
    // Backup the corrupted file
    try {
      const backupPath = `${dbPath}.corrupted.${Date.now()}`;
      fs.copyFileSync(dbPath, backupPath);
      printMessage(`⚠️ Corrupted database backed up to ${backupPath}`, 'yellow');
      
      // Create a new empty database
      fs.writeFileSync(dbPath, JSON.stringify({ sessions: {}, otpRequests: {} }));
      printMessage('⚠️ Created new empty database file', 'yellow');
    } catch (backupError) {
      printMessage('❌ Failed to backup corrupted database file', 'red', true);
    }
    
    return false;
  }
}

// Function to check disk space
async function checkDiskSpace(): Promise<boolean> {
  return new Promise((resolve) => {
    printMessage('\nChecking available disk space...', 'blue');
    
    // Use df command to check disk space
    exec('df -h .', (error, stdout, stderr) => {
      if (error) {
        printMessage('❌ Failed to check disk space', 'red', true);
        resolve(false);
        return;
      }
      
      // Parse the output to get available space
      const lines = stdout.trim().split('\n');
      if (lines.length < 2) {
        printMessage('❌ Failed to parse disk space output', 'red', true);
        resolve(false);
        return;
      }
      
      const parts = lines[1].split(/\s+/);
      if (parts.length < 5) {
        printMessage('❌ Failed to parse disk space output', 'red', true);
        resolve(false);
        return;
      }
      
      const availableSpace = parts[3];
      const usedPercentage = parts[4];
      
      printMessage(`ℹ️ Available disk space: ${availableSpace} (${usedPercentage} used)`, 'blue');
      
      // Warning if disk space is low
      if (parseInt(usedPercentage) > 90) {
        printMessage('⚠️ Disk space is critically low. Consider freeing up space.', 'yellow');
      } else if (parseInt(usedPercentage) > 80) {
        printMessage('⚠️ Disk space is running low. Monitor usage.', 'yellow');
      } else {
        printMessage('✅ Sufficient disk space available', 'green');
      }
      
      resolve(true);
    });
  });
}

// Function to check Telegram bot token
async function checkTelegramToken(): Promise<boolean> {
  printMessage('\nChecking Telegram bot token...', 'blue');
  
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    printMessage('❌ BOT_TOKEN is not set', 'red', true);
    return false;
  }
  
  try {
    const response = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`, { timeout: 5000 });
    
    if (response.data && response.data.ok) {
      const botInfo = response.data.result;
      printMessage(`✅ Bot token is valid for: @${botInfo.username} (${botInfo.first_name})`, 'green');
      return true;
    } else {
      printMessage('❌ Bot token is invalid', 'red', true);
      return false;
    }
  } catch (error: any) {
    printMessage(`❌ Failed to validate bot token: ${error.message}`, 'red', true);
    return false;
  }
}

// Main health check function
async function runHealthCheck(): Promise<void> {
  printMessage('=== Copperx Telegram Bot Health Check ===', 'blue');
  
  const envCheck = await checkEnvironmentVariables();
  const dirCheck = await checkDirectories();
  const apiCheck = await checkApiConnectivity();
  const dbCheck = await checkDatabase();
  const diskCheck = await checkDiskSpace();
  const botCheck = await checkTelegramToken();
  
  printMessage('\n=== Health Check Summary ===', 'blue');
  printMessage(`Environment Variables: ${envCheck ? '✅' : '❌'}`, envCheck ? 'green' : 'red');
  printMessage(`Required Directories: ${dirCheck ? '✅' : '❌'}`, dirCheck ? 'green' : 'red');
  printMessage(`API Connectivity:     ${apiCheck ? '✅' : '❌'}`, apiCheck ? 'green' : 'red');
  printMessage(`Database:             ${dbCheck ? '✅' : '❌'}`, dbCheck ? 'green' : 'red');
  printMessage(`Disk Space:           ${diskCheck ? '✅' : '❌'}`, diskCheck ? 'green' : 'red');
  printMessage(`Telegram Bot Token:   ${botCheck ? '✅' : '❌'}`, botCheck ? 'green' : 'red');
  
  const allChecksPass = envCheck && dirCheck && apiCheck && dbCheck && diskCheck && botCheck;
  
  printMessage('\n=== Overall Status ===', 'blue');
  if (allChecksPass) {
    printMessage('✅ All health checks passed. The bot is ready to start.', 'green');
    process.exit(0);
  } else {
    printMessage('⚠️ Some health checks failed. The bot may not function correctly.', 'yellow');
    process.exit(1);
  }
}

// Run the health check
runHealthCheck(); 
# Copperx Telegram Bot

A sophisticated Telegram bot that integrates with the Copperx platform, enabling users to manage their stablecoin accounts directly through Telegram. This production-ready bot allows users to deposit, withdraw, transfer USDC, and receive real-time notifications without visiting the web app.

![Copperx Bot Banner](https://i.imgur.com/placeholder-image.png) <!-- Consider adding a banner image -->

## 📑 Table of Contents

- [Features](#features)
- [Technical Architecture](#technical-architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Bot](#running-the-bot)
- [Deployment](#deployment)
- [Bot Commands Reference](#bot-commands-reference)
- [API Integration Details](#api-integration-details)
- [Security Features](#security-features)
- [Maintenance Scripts](#maintenance-scripts)
- [Troubleshooting Guide](#troubleshooting-guide)
- [Development Roadmap](#development-roadmap)
- [Support](#support)
- [License](#license)

## ✨ Features

### 🔐 Authentication & Account Management
- Secure login with Copperx credentials (email + OTP)
- View detailed account profile and verify KYC/KYB status
- Seamless redirection to the platform if KYC/KYB approval is needed

### 👛 Wallet Management
- Real-time display of wallet balances across multiple networks
- Intuitive interface to set default wallet for transactions
- Comprehensive transaction history with filtering options

### 💸 Fund Transfers
- Send USDC to email addresses with transparent fee structure
- Withdraw USDC to external wallets with network selection
- Bank withdrawals with proper validation and minimum amount checks
- Detailed transaction confirmation with fee breakdown

### 🔔 Real-time Notifications
- Instant deposit alerts via Pusher integration
- Formatted transaction notifications with all relevant details
- Transaction status updates

## 🏗 Technical Architecture

The bot is built with a robust, production-ready architecture:

- **Language**: TypeScript/Node.js with strict type safety
- **Framework**: Telegraf for Telegram bot interactions
- **HTTP Client**: Axios for API requests
- **Real-time**: Pusher for notifications
- **State Management**: In-memory session storage with persistence options
- **Error Handling**: Comprehensive error handling with user feedback
- **Maintenance**: Automated scripts for backup, cleanup, and health checks

## 🔧 Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- A Telegram account
- A Copperx account
- Telegram Bot token (obtained from [@BotFather](https://t.me/botfather))
- Pusher credentials for real-time notifications

## 📥 Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/copperx-telegram-bot.git
   cd copperx-telegram-bot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create an environment configuration by copying the example:
   ```bash
   cp .env.example .env
   ```

4. Build the TypeScript code:
   ```bash
   npm run build
   ```

## ⚙️ Configuration

Edit the `.env` file with your specific configuration:

```
# Bot Configuration
BOT_TOKEN=your_telegram_bot_token

# API Configuration
COPPERX_API_URL=https://income-api.copperx.io

# Pusher Configuration for Real-time Notifications
PUSHER_APP_ID=your_pusher_app_id
PUSHER_KEY=e089376087cac1a62785
PUSHER_SECRET=your_pusher_secret
PUSHER_CLUSTER=ap1

# Database Configuration (Optional)
DB_HOST=localhost
DB_PORT=27017
DB_NAME=copperx_bot
DB_USER=user
DB_PASSWORD=password

# Logging Configuration
LOG_LEVEL=info
```

## 🚀 Running the Bot

### Development Mode
```bash
npm run dev
```

This starts the bot in development mode with hot-reloading enabled.

### Production Mode
```bash
npm run build
npm start
```

### Using PM2 for Production
For robust production deployment, we recommend using PM2:

```bash
# Install PM2 globally
npm install -g pm2

# Start the bot with PM2
pm2 start ecosystem.config.js

# View logs
pm2 logs

# Monitor the bot
pm2 monit
```

## 🌐 Deployment

### Deployment on Render.com

A simple, free option for deploying the bot:

1. Push your code to a GitHub repository
2. Create a new Web Service on [Render](https://render.com/)
3. Connect your GitHub repository
4. Configure the following settings:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Environment Variables**: Add all variables from your `.env` file

### Server Deployment with PM2

For deploying on your own server:

1. SSH into your server
2. Clone the repository
3. Install dependencies and build
4. Set up PM2 to run the bot and handle restarts
5. Configure PM2 to start on system boot:
   ```bash
   pm2 startup
   pm2 save
   ```

## 🤖 Bot Commands Reference

| Command | Description | Required Auth | Example Usage |
|---------|-------------|---------------|--------------|
| `/start` | Initialize the bot and see welcome message | No | `/start` |
| `/help` | Display available commands and usage instructions | No | `/help` |
| `/login` | Authenticate with your Copperx account | No | `/login` |
| `/logout` | End your current session | Yes | `/logout` |
| `/profile` | View your account profile and KYC status | Yes | `/profile` |
| `/balance` | Check your wallet balances across networks | Yes | `/balance` |
| `/setdefault` | Set your default wallet for transactions | Yes | `/setdefault` |
| `/send` | Send USDC to an email address | Yes | `/send` |
| `/withdraw` | Withdraw USDC to an external wallet | Yes | `/withdraw` |
| `/bank` | Withdraw USDC to a bank account | Yes | `/bank` |
| `/history` | View your transaction history | Yes | `/history`
| `/deposit` | Show deposit information and address | Yes | `/deposit` |

### Interactive Flows

The bot implements conversational flows for complex operations:

1. **Send USDC Flow**:
   - Start with `/send`
   - Enter recipient email
   - Enter amount
   - Confirm transaction details including fees
   - Receive confirmation

2. **Withdraw Flow**:
   - Start with `/withdraw`
   - Select network (Solana/Ethereum)
   - Enter wallet address
   - Enter amount
   - Confirm transaction details including fees
   - Receive confirmation

## 🔌 API Integration Details

The bot integrates with the Copperx API (https://income-api.copperx.io/api/doc) to provide functionality:

### Authentication
- **Request OTP**: `POST /api/auth/email-otp/request`
  - Payload: `{ email: string }`
  - Response: Status indicating OTP sent

- **Authenticate**: `POST /api/auth/email-otp/authenticate`
  - Payload: `{ email: string, otp: string }`
  - Response: `{ token: string }` for API authorization

### Profile & KYC
- **Get Profile**: `GET /api/auth/me`
  - Headers: `Authorization: Bearer {token}`
  - Response: User profile information

- **Get KYC Status**: `GET /api/kycs`
  - Headers: `Authorization: Bearer {token}`
  - Response: KYC status information

### Wallet Operations
- **Get Balances**: `GET /api/wallets/balances`
  - Headers: `Authorization: Bearer {token}`
  - Response: Array of wallet balances by network/currency

- **Set Default Wallet**: `POST /api/wallets/default`
  - Headers: `Authorization: Bearer {token}`
  - Payload: `{ network: string, address: string }`
  - Response: Default wallet confirmation

### Transfers
- **Email Transfer**: `POST /api/transfers/send`
  - Headers: `Authorization: Bearer {token}`
  - Payload: `{ email: string, amount: number }`
  - Response: Transfer confirmation

- **Wallet Transfer**: `POST /api/transfers/wallet-withdraw`
  - Headers: `Authorization: Bearer {token}`
  - Payload: `{ address: string, amount: number, network: string }`
  - Response: Transfer confirmation

- **Transaction History**: `GET /api/transfers?page=1&limit=10`
  - Headers: `Authorization: Bearer {token}`
  - Response: Paginated list of transfers

### Notifications
- **Authentication**: `POST /api/notifications/auth`
  - Headers: `Authorization: Bearer {token}`
  - Payload: `{ socket_id: string, channel_name: string }`
  - Response: Pusher authentication data

- **Subscription Channel**: `private-org-${organizationId}`
- **Event**: `deposit`

## 🔒 Security Features

The bot implements multiple security measures:

- **Session Management**: Secure token storage with expiration handling
- **OTP Authentication**: Time-limited one-time passwords for login
- **Transaction Confirmations**: Explicit approval required for all transfers
- **Input Validation**: Thorough validation of all user inputs
- **Error Handling**: Secure error reporting without exposing sensitive information
- **Environment Variables**: No hardcoded credentials in the codebase

## 🔧 Maintenance Scripts

The bot includes automated maintenance scripts:

- **Backup**: Scheduled backup of critical data
  ```bash
  npm run backup
  ```

- **Health Check**: Automated system checks
  ```bash
  npm run health-check
  ```

- **Cleanup**: Temporary file and session cleanup
  ```bash
  npm run cleanup
  ```

## 🔍 Troubleshooting Guide

### Common Issues and Solutions

#### Authentication Problems
- **Issue**: OTP verification fails
  - **Solution**: Ensure your email is registered with Copperx and check for typos in the OTP
  - **Debug**: Check API response for specific error codes

- **Issue**: Session expired during use
  - **Solution**: Use `/login` to reauthenticate
  - **Debug**: The bot will automatically prompt for re-login when tokens expire

#### Notification Issues
- **Issue**: Missing deposit notifications
  - **Solution**: Verify Pusher credentials and channel subscription
  - **Debug**: Run `/simulate` to test notification system

- **Issue**: Delayed notifications
  - **Solution**: This may be due to Pusher or API latency; notifications are eventually consistent

#### Transaction Failures
- **Issue**: Insufficient balance for transfer
  - **Solution**: Ensure your wallet has enough funds including fees
  - **Debug**: Use `/balance` to check current balances

- **Issue**: Minimum amount not met
  - **Solution**: Each transfer type has minimum amounts; the bot will display these requirements

- **Issue**: Invalid wallet address
  - **Solution**: Double-check the wallet address format for the selected network

### Logging

The bot logs information at multiple levels:

- **Error**: Critical failures that prevent operations
- **Warning**: Non-critical issues that may affect functionality
- **Info**: General operational information
- **Debug**: Detailed information for troubleshooting

Access logs with:
```bash
# If running with PM2
pm2 logs copperx-bot

# If running directly
cat logs/app.log
```

## 🛣 Development Roadmap

Future enhancements planned for the bot:

- **Multi-language Support**: Localization for multiple languages
- **Enhanced Analytics**: Track usage patterns and performance metrics
- **Bulk Transfers**: Support for sending to multiple recipients at once
- **Advanced Notifications**: Customizable notification preferences
- **Web App Integration**: Deep linking with the Copperx web application

## 🤝 Support

For support with the bot:

- **Telegram Community**: [https://t.me/copperxcommunity/2183](https://t.me/copperxcommunity/2183)
- **Documentation**: Refer to the [API Documentation](https://income-api.copperx.io/api/doc)
- **Issues**: Open on the GitHub repository

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Made with ❤️ for Copperx
</p> 
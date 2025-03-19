# Copperx Telegram Bot

A Telegram bot for interacting with the Copperx platform. This bot allows users to manage their Copperx accounts, view wallet balances, transfer funds, and receive real-time deposit notifications without leaving Telegram.

## Features

- **Authentication & Account Management**
  - Login with Copperx credentials (email + OTP)
  - View account profile and KYC/KYB status
  - Redirect to the platform if KYC/KYB isn't approved

- **Wallet Management**
  - Display wallet balances across networks
  - Set default wallet for transactions
  - View transaction history

- **Fund Transfers**
  - Send USDC to email addresses
  - Withdraw USDC to external wallets
  - View recent transactions

- **Deposit Notifications**
  - Receive real-time deposit alerts via Pusher

## Technologies Used

- **TypeScript/Node.js**: For the bot's codebase
- **Telegraf**: Framework for building Telegram bots
- **Axios**: HTTP client for API requests
- **Pusher**: For real-time notifications

## Prerequisites

- Node.js (v14 or higher)
- Telegram account
- Copperx account
- Bot token from BotFather on Telegram
- Pusher credentials

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/copperx-telegram-bot.git
   cd copperx-telegram-bot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   BOT_TOKEN=your_telegram_bot_token
   COPPERX_API_URL=https://income-api.copperx.io
   PUSHER_APP_ID=your_pusher_app_id
   PUSHER_KEY=e089376087cac1a62785
   PUSHER_SECRET=your_pusher_secret
   PUSHER_CLUSTER=ap1
   ```

4. Build the TypeScript code:
   ```bash
   npm run build
   ```

## Running the Bot

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

## Deployment

The bot can be deployed on various platforms. A simple and free option is to use [Render](https://render.com/):

1. Push your code to a GitHub repository
2. Create a new Web Service on Render
3. Connect your GitHub repository
4. Set the build command to `npm install && npm run build`
5. Set the start command to `npm start`
6. Add your environment variables in the Render dashboard

## Bot Commands

- `/start` - Start the bot and see welcome message
- `/help` - Show help information
- `/login` - Login to your Copperx account
- `/logout` - Logout from your account
- `/profile` - View your account profile
- `/balance` - Check your wallet balances
- `/setdefault` - Set your default wallet
- `/send` - Send USDC to an email address
- `/withdraw` - Withdraw USDC to an external wallet
- `/bank` - Withdraw USDC to a bank account (redirects to web app)
- `/history` - View your transaction history
- `/deposit` - Show deposit information
- `/simulate` - Simulate a deposit notification (for testing)

## Security Considerations

- The bot stores user sessions in memory (they are lost on restart)
- OTP authentication is used to authenticate with the Copperx API
- Tokens are stored securely and never exposed to users
- Transaction confirmations require explicit approval

## API Integration

The bot integrates with the Copperx API to perform operations:

- **Authentication**: Using email + OTP
- **Profile and KYC**: Fetching user profile and KYC status
- **Wallets**: Getting balances and setting default wallet
- **Transfers**: Sending funds via email, to external wallets, and viewing history
- **Notifications**: Real-time deposit notifications using Pusher

## Troubleshooting

### Common Issues

1. **Bot not responding**: Check if your bot token is correct and the bot is running.
2. **Authentication failures**: Ensure your Copperx API credentials are correct.
3. **Notification issues**: Verify your Pusher credentials and subscription.

### Logs

The bot logs errors to the console. Check these logs for debugging information.

## Support

For support, please contact:
- Telegram: https://t.me/copperxcommunity/2183

## License

This project is licensed under the MIT License - see the LICENSE file for details. 
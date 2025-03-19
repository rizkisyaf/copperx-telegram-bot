module.exports = {
  apps: [
    {
      name: 'copperx-telegram-bot',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/error.log',
      out_file: 'logs/output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      // Graceful shutdown with SIGINT
      kill_timeout: 5000,
      // Cluster mode disabled (Telegram bot should run as a single instance)
      exec_mode: 'fork',
      // Restart delay if application crashes
      restart_delay: 5000,
    },
  ],
}; 
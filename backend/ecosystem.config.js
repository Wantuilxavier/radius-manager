// PM2 Ecosystem — Radius Manager
module.exports = {
  apps: [
    {
      name: 'radius-manager',
      script: './server.js',
      cwd: '/opt/radius-manager/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',

      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },

      // Logs
      out_file: '/var/log/radius-manager/app.log',
      error_file: '/var/log/radius-manager/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,

      // Restart policy
      restart_delay: 3000,
      min_uptime: '5s',
      max_restarts: 10,
    },
  ],
};

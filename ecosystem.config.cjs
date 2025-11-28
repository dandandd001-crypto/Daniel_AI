module.exports = {
  apps: [{
    name: 'daniel-ai',
    script: 'dist/index.cjs',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: '5000',
      PROJECTS_DIR: '/var/www/danielai/projects',
      DATABASE_URL: 'postgresql://daniel-ai_user:change_this_password_immediately@localhost:5432/daniel-ai_db'
    },
    error_file: '/home/ubuntu/.pm2/logs/daniel-ai-error.log',
    out_file: '/home/ubuntu/.pm2/logs/daniel-ai-out.log',
    log_file: '/home/ubuntu/.pm2/logs/daniel-ai-combined.log'
  }]
};

module.exports = {
  apps: [{
    name: 'inboxgpt',
    script: 'node_modules/.bin/next',
    args: 'start --port 3103',
    cwd: '/home/james/InboxGPT',
    env: {
      NODE_ENV: 'production',
      PORT: '3103',
      NODE_OPTIONS: '--max-old-space-size=2048',
    },
    max_memory_restart: '1800M',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_restarts: 10,
    restart_delay: 5000,
  }],
};

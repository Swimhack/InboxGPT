module.exports = {
  apps: [
    {
      name: 'inboxgpt',
      script: 'server.js',
      cwd: '/var/www/sites/inboxgpt.stricklandai.com/app',
      env: {
        NODE_ENV: 'production',
        PORT: 3100,
        HOSTNAME: '127.0.0.1',
      },
    },
  ],
};

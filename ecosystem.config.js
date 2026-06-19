module.exports = {
  apps: [{
    name:        'dashboard-sosmed',
    script:      'server.js',
    instances:   1,
    autorestart: true,
    watch:       false,
    env_production: {
      NODE_ENV:  'production',
      PORT:       3000,
      BASE_PATH: '/dashboard-sosmed',
    }
  }]
};

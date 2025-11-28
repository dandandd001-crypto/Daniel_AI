#!/bin/bash
set -e

DOMAIN=${1:-"app.example.com"}
EMAIL=${2:-"admin@example.com"}

echo "🚀 Deploying to $DOMAIN"

# System
apt-get update && apt-get upgrade -y
apt-get install -y curl wget git build-essential postgresql nginx certbot python3-certbot-nginx ufw

# PostgreSQL
systemctl start postgresql
systemctl enable postgresql

# Database
sudo -u postgres psql << 'DB'
DROP DATABASE IF EXISTS "daniel-ai_db";
DROP USER IF EXISTS "daniel-ai_user";
CREATE USER "daniel-ai_user" WITH PASSWORD 'change_this_password_immediately';
CREATE DATABASE "daniel-ai_db" OWNER "daniel-ai_user";
GRANT ALL PRIVILEGES ON DATABASE "daniel-ai_db" TO "daniel-ai_user";
DB

# App
mkdir -p /var/www/danielai
cd /var/www/danielai
rm -rf Daniel_AI projects
mkdir -p projects
git clone https://github.com/dandandd001-crypto/Daniel_AI.git Daniel_AI
cd Daniel_AI

# Build
npm install
npm run build
DATABASE_URL="postgresql://daniel-ai_user:change_this_password_immediately@localhost:5432/daniel-ai_db" npm run db:push

# PM2
npm install -g pm2
cat > ecosystem.config.cjs << 'PM2'
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
    }
  }]
};
PM2

pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root | bash || true

# Nginx HTTP
cat > /etc/nginx/sites-available/$DOMAIN << "NGINX"
upstream app { server 127.0.0.1:5000; }
server {
  listen 80;
  server_name $DOMAIN;
  location / {
    proxy_pass http://app;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection 'upgrade';
    client_max_body_size 100M;
  }
}
NGINX

sed -i "s/\$DOMAIN/$DOMAIN/g" /etc/nginx/sites-available/$DOMAIN
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx && systemctl enable nginx

# SSL
certbot certonly --standalone --non-interactive --agree-tos --email $EMAIL -d $DOMAIN --preferred-challenges http || true

# Nginx HTTPS
cat > /etc/nginx/sites-available/$DOMAIN << "NGINX_SSL"
upstream app { server 127.0.0.1:5000; }
server {
  listen 80;
  server_name $DOMAIN;
  return 301 https://\$server_name\$request_uri;
}
server {
  listen 443 ssl http2;
  server_name $DOMAIN;
  ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;
  location / {
    proxy_pass http://app;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection 'upgrade';
    client_max_body_size 100M;
  }
}
NGINX_SSL

sed -i "s/\$DOMAIN/$DOMAIN/g" /etc/nginx/sites-available/$DOMAIN
nginx -t && systemctl reload nginx

# Firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Done
echo ""
echo "✅ DONE! Your app is live at https://$DOMAIN"
pm2 list
pm2 logs daniel-ai --lines 20

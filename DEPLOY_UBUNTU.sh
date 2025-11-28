#!/bin/bash

# DANIEL AI - Complete Fresh Ubuntu 24.04 Deployment Script
# Usage: sudo ./DEPLOY_UBUNTU.sh your-domain.com your-email@example.com
# Run on a FRESH Ubuntu 24.04 instance with root/sudo access

set -e

DOMAIN=${1:-"danielai.example.com"}
EMAIL=${2:-"admin@example.com"}
PROJECT_DIR="/var/www/danielai"
REPO_URL="https://github.com/dandandd001-crypto/Daniel_AI.git"

if [ "$DOMAIN" = "danielai.example.com" ]; then
  echo "❌ Error: Please provide your actual domain name"
  echo "Usage: sudo $0 your-domain.com your-email@example.com"
  exit 1
fi

echo "🚀 DANIEL AI - Complete Fresh Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"
echo ""

# ============================================================================
# 1. SYSTEM UPDATES
# ============================================================================
echo "📦 Step 1: Updating system packages..."
apt-get update
apt-get upgrade -y
apt-get install -y curl wget git build-essential

# ============================================================================
# 2. NODE.JS INSTALLATION
# ============================================================================
echo "📦 Step 2: Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

echo "✅ Node.js $(node -v)"
echo "✅ npm $(npm -v)"

# ============================================================================
# 3. POSTGRESQL INSTALLATION
# ============================================================================
echo "📦 Step 3: Installing PostgreSQL..."
apt-get install -y postgresql postgresql-contrib

systemctl start postgresql
systemctl enable postgresql

echo "🗄️  Creating database and user..."
sudo -u postgres psql << 'SQL_EOF'
DROP DATABASE IF EXISTS "daniel-ai_db";
DROP USER IF EXISTS "daniel-ai_user";

CREATE USER "daniel-ai_user" WITH PASSWORD 'change_this_password_immediately';
CREATE DATABASE "daniel-ai_db" OWNER "daniel-ai_user";

GRANT ALL PRIVILEGES ON DATABASE "daniel-ai_db" TO "daniel-ai_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "daniel-ai_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "daniel-ai_user";
SQL_EOF

echo "✅ PostgreSQL ready"

# ============================================================================
# 4. PROJECT SETUP
# ============================================================================
echo "📂 Step 4: Setting up project..."
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR

rm -rf Daniel_AI projects 2>/dev/null || true
mkdir -p projects

echo "📥 Cloning repository..."
git clone $REPO_URL Daniel_AI
cd Daniel_AI

echo "📥 Installing npm dependencies..."
npm install

echo "🔨 Building application..."
npm run build

echo "📋 Setting up database..."
DATABASE_URL="postgresql://daniel-ai_user:change_this_password_immediately@localhost:5432/daniel-ai_db" npm run db:push

# ============================================================================
# 5. PM2 INSTALLATION & CONFIGURATION
# ============================================================================
echo "📦 Step 5: Installing PM2..."
npm install -g pm2

echo "⚙️  Creating PM2 ecosystem config..."
cat > ecosystem.config.cjs << 'ECOSYSTEM_EOF'
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
    error_file: '/var/log/daniel-ai-error.log',
    out_file: '/var/log/daniel-ai-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    autorestart: true,
    watch: false
  }]
};
ECOSYSTEM_EOF

echo "🚀 Starting application..."
pm2 start ecosystem.config.cjs
pm2 save --force

echo "⚙️  Setting up PM2 autostart..."
pm2 startup systemd -u root --hp /root | bash || true

sleep 3
pm2 list

# ============================================================================
# 6. NGINX INSTALLATION & CONFIGURATION
# ============================================================================
echo "📦 Step 6: Installing Nginx..."
apt-get install -y nginx

echo "⚙️  Configuring Nginx..."
cat > /etc/nginx/sites-available/$DOMAIN << 'NGINX_EOF'
upstream daniel_ai {
    server 127.0.0.1:5000;
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name DOMAIN_PLACEHOLDER;
    
    client_max_body_size 100M;
    
    location / {
        proxy_pass http://daniel_ai;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
NGINX_EOF

sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/nginx/sites-available/$DOMAIN

ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl restart nginx
systemctl enable nginx

echo "✅ Nginx configured"

# ============================================================================
# 7. SSL/TLS WITH CERTBOT
# ============================================================================
echo "📦 Step 7: Installing SSL certificate..."
apt-get install -y certbot python3-certbot-nginx

certbot certonly --standalone --non-interactive --agree-tos --email $EMAIL -d $DOMAIN --preferred-challenges http || echo "⚠️  Certificate setup - you may need to run manually"

# Update Nginx for HTTPS
cat > /etc/nginx/sites-available/$DOMAIN << 'NGINX_HTTPS_EOF'
upstream daniel_ai {
    server 127.0.0.1:5000;
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name DOMAIN_PLACEHOLDER;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name DOMAIN_PLACEHOLDER;
    
    ssl_certificate /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    client_max_body_size 100M;
    
    location / {
        proxy_pass http://daniel_ai;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
NGINX_HTTPS_EOF

sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/nginx/sites-available/$DOMAIN

nginx -t
systemctl reload nginx

echo "✅ SSL certificate installed"

# ============================================================================
# 8. FIREWALL CONFIGURATION
# ============================================================================
echo "🔥 Step 8: Configuring firewall..."
apt-get install -y ufw

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "✅ Firewall configured"

# ============================================================================
# 9. VERIFICATION
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ DEPLOYMENT COMPLETE!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Your app is now running at:"
echo "   https://$DOMAIN"
echo ""
echo "📊 Check status:"
echo "   pm2 status"
echo "   pm2 logs daniel-ai"
echo ""
echo "🗄️  Database credentials:"
echo "   Host: localhost"
echo "   User: daniel-ai_user"
echo "   Password: change_this_password_immediately"
echo "   Database: daniel-ai_db"
echo ""
echo "⚠️  IMPORTANT: Change the database password immediately!"
echo ""

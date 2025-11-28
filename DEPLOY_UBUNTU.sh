#!/bin/bash

# DANIEL AI - Complete Fresh Ubuntu 24.04 Deployment Script
# Usage: ./DEPLOY_UBUNTU.sh your-domain.com your-email@example.com
# Run on a FRESH Ubuntu 24.04 instance as root or with sudo

set -e

DOMAIN=${1:-"danielai.example.com"}
EMAIL=${2:-"admin@example.com"}
PROJECT_DIR="/var/www/danielai"
REPO_URL="https://github.com/dandandd001-crypto/Daniel_AI.git"

echo "🚀 DANIEL AI - Complete Fresh Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"
echo "Project Dir: $PROJECT_DIR"
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

echo "✅ Starting PostgreSQL..."
systemctl start postgresql
systemctl enable postgresql

# Create database and user
echo "🗄️  Creating database and user..."
sudo -u postgres psql << EOF
DROP DATABASE IF EXISTS "daniel-ai_db";
DROP USER IF EXISTS "daniel-ai_user";

CREATE USER "daniel-ai_user" WITH PASSWORD 'change_this_password_immediately';
CREATE DATABASE "daniel-ai_db" OWNER "daniel-ai_user";

GRANT ALL PRIVILEGES ON DATABASE "daniel-ai_db" TO "daniel-ai_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "daniel-ai_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "daniel-ai_user";
EOF

echo "✅ PostgreSQL ready"

# ============================================================================
# 4. PROJECT SETUP
# ============================================================================
echo "📂 Step 4: Setting up project directory..."
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR

rm -rf Daniel_AI projects
mkdir -p projects

echo "📥 Cloning repository..."
git clone $REPO_URL Daniel_AI
cd Daniel_AI

echo "📥 Installing npm dependencies..."
npm install

echo "🔨 Building application..."
npm run build

echo "📋 Setting up database schema..."
DATABASE_URL="postgresql://daniel-ai_user:change_this_password_immediately@localhost:5432/daniel-ai_db" npm run db:push

# ============================================================================
# 5. PM2 INSTALLATION & CONFIGURATION
# ============================================================================
echo "📦 Step 5: Installing PM2..."
npm install -g pm2

echo "⚙️  Creating PM2 ecosystem config..."
cat > ecosystem.config.cjs << 'EOF'
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
    merge_logs: true,
    autorestart: true,
    watch: false
  }]
};
EOF

echo "🚀 Starting application with PM2..."
pm2 start ecosystem.config.cjs
pm2 save --force

echo "⚙️  Setting up PM2 startup on boot..."
pm2 startup systemd -u root --hp /root | bash

echo "✅ Application started"
sleep 2

# ============================================================================
# 6. NGINX INSTALLATION & CONFIGURATION
# ============================================================================
echo "📦 Step 6: Installing Nginx..."
apt-get install -y nginx

echo "⚙️  Configuring Nginx reverse proxy..."
cat > /etc/nginx/sites-available/$DOMAIN << 'NGINX_EOF'
upstream daniel_ai {
    server localhost:5000;
}

server {
    listen 80;
    listen [::]:80;
    server_name SERVER_DOMAIN;
    
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
        
        client_max_body_size 100M;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
NGINX_EOF

# Replace placeholder with actual domain
sed -i "s/SERVER_DOMAIN/$DOMAIN/g" /etc/nginx/sites-available/$DOMAIN

echo "🔗 Enabling Nginx site..."
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
rm -f /etc/nginx/sites-enabled/default

echo "✅ Testing Nginx configuration..."
nginx -t

echo "🔄 Reloading Nginx..."
systemctl restart nginx
systemctl enable nginx

# ============================================================================
# 7. SSL/TLS WITH CERTBOT
# ============================================================================
echo "📦 Step 7: Installing Certbot..."
apt-get install -y certbot python3-certbot-nginx

echo "🔒 Requesting SSL certificate..."
certbot certonly --nginx --non-interactive --agree-tos --email $EMAIL -d $DOMAIN

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
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ DEPLOYMENT COMPLETE!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Application Status:"
pm2 list
echo ""
echo "📊 Recent Logs:"
pm2 logs daniel-ai --lines 20
echo ""
echo "🌐 Your app is now available at:"
echo "   http://$DOMAIN  (redirects to https)"
echo "   https://$DOMAIN"
echo ""
echo "📝 Useful Commands:"
echo "   pm2 status                 # Check process status"
echo "   pm2 logs daniel-ai         # View logs"
echo "   pm2 restart daniel-ai      # Restart app"
echo "   systemctl restart nginx    # Restart web server"
echo ""
echo "🗄️  Database:"
echo "   Host: localhost"
echo "   User: daniel-ai_user"
echo "   Password: change_this_password_immediately"
echo "   Database: daniel-ai_db"
echo ""
echo "⚠️  SECURITY NOTES:"
echo "   1. Change the database password immediately!"
echo "   2. Keep SSH keys secure"
echo "   3. Monitor logs regularly: pm2 logs"
echo ""

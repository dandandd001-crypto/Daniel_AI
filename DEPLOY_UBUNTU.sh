#!/bin/bash

################################################################################
# DANIEL AI DEV - Ubuntu Deployment Script
# 
# Usage: bash DEPLOY_UBUNTU.sh <domain> <email>
# Example: bash DEPLOY_UBUNTU.sh app.example.com admin@example.com
#
# This script deploys the DANIEL AI application to a fresh Ubuntu 20.04+ server
# Requirements:
# - Ubuntu 20.04 LTS or newer
# - Root/sudo access
# - A domain name pointing to this server's IP
################################################################################

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="${1:-app.example.com}"
EMAIL="${2:-admin@example.com}"
APP_NAME="daniel-ai"
APP_DIR="/var/www/danielai/Daniel_AI"
APP_USER="ubuntu"
APP_PORT="5000"
DB_NAME="${APP_NAME}_db"
DB_USER="${APP_NAME}_user"

# Validate inputs
if [ "$DOMAIN" = "app.example.com" ]; then
  echo -e "${RED}❌ Error: Please provide a real domain name${NC}"
  echo "Usage: $0 <domain> <email>"
  exit 1
fi

echo -e "${BLUE}🚀 Starting DANIEL AI deployment to ${DOMAIN}${NC}"

# Update system
echo -e "${YELLOW}📦 Updating system packages...${NC}"
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y curl wget git build-essential

# Install Node.js
if ! command -v node &> /dev/null; then
  echo -e "${YELLOW}📦 Installing Node.js 20...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs npm
fi

# Install PostgreSQL
if ! command -v psql &> /dev/null; then
  echo -e "${YELLOW}📦 Installing PostgreSQL...${NC}"
  sudo apt-get install -y postgresql postgresql-contrib postgresql-client
  sudo systemctl enable postgresql
  sudo systemctl start postgresql
fi

# Create app user
if ! id "$APP_USER" &>/dev/null; then
  echo -e "${YELLOW}👤 Creating application user...${NC}"
  sudo useradd -m -s /bin/bash "$APP_USER"
fi

# Create app directory
echo -e "${YELLOW}📁 Setting up application directory...${NC}"
sudo mkdir -p "$APP_DIR"
sudo chown "$APP_USER:$APP_USER" "$APP_DIR"

# Setup database
echo -e "${YELLOW}🗄️  Setting up PostgreSQL database...${NC}"
sudo -u postgres psql <<EOF
DROP DATABASE IF EXISTS "$DB_NAME";
DROP USER IF EXISTS "$DB_USER";
CREATE DATABASE "$DB_NAME";
CREATE USER "$DB_USER" WITH PASSWORD 'change_this_password_immediately';
ALTER ROLE "$DB_USER" SET client_encoding TO 'utf8';
ALTER ROLE "$DB_USER" SET default_transaction_isolation TO 'read committed';
ALTER ROLE "$DB_USER" SET default_transaction_deferrable TO on;
ALTER ROLE "$DB_USER" SET default_transaction_level TO 'read committed';
GRANT ALL PRIVILEGES ON DATABASE "$DB_NAME" TO "$DB_USER";
ALTER DATABASE "$DB_NAME" OWNER TO "$DB_USER";
EOF

# Download and setup application
echo -e "${YELLOW}📥 Setting up application...${NC}"
cd "$APP_DIR"

# Get the latest build (replace with your actual deployment method)
# Option 1: Clone from GitHub
# sudo -u "$APP_USER" git clone <your-repo-url> .

# Option 2: If you have a built package
# wget -O app.tar.gz <your-app-url>
# sudo tar -xzf app.tar.gz

# For this example, we assume files are already present
if [ ! -f "package.json" ]; then
  echo -e "${RED}❌ Error: No application found in $APP_DIR${NC}"
  echo "Please upload your application files first"
  exit 1
fi

# Install dependencies
echo -e "${YELLOW}📚 Installing npm dependencies...${NC}"
sudo -u "$APP_USER" npm install --legacy-peer-deps

# Build application
if grep -q '"build"' package.json; then
  echo -e "${YELLOW}🔨 Building application...${NC}"
  sudo -u "$APP_USER" npm run build
fi

# Install PM2
echo -e "${YELLOW}🎯 Installing PM2 process manager...${NC}"
sudo npm install -g pm2

# Create ecosystem config file (.cjs because package.json uses "type": "module")
echo -e "${YELLOW}📝 Creating PM2 ecosystem config...${NC}"
cd "$APP_DIR"
cat > ecosystem.config.cjs << ECOSYSTEM_EOF
module.exports = {
  apps: [{
    name: '$APP_NAME',
    script: 'dist/index.cjs',
    instances: 1,
    env: {
      DATABASE_URL: 'postgresql://$DB_USER:change_this_password_immediately@localhost:5432/$DB_NAME',
      NODE_ENV: 'production',
      PORT: '5000',
      PROJECTS_DIR: '/var/www/danielai/projects'
    }
  }]
};
ECOSYSTEM_EOF

# Start application with PM2 using ecosystem config
echo -e "${YELLOW}▶️  Starting application...${NC}"
sudo pm2 kill
sudo -u "$APP_USER" pm2 start ecosystem.config.cjs
sudo -u "$APP_USER" pm2 startup
sudo -u "$APP_USER" pm2 save

# Install and configure Nginx
echo -e "${YELLOW}🌐 Installing and configuring Nginx...${NC}"
sudo apt-get install -y nginx

# Create Nginx configuration
sudo tee /etc/nginx/sites-available/$DOMAIN > /dev/null <<'NGINX_EOF'
upstream daniel_app {
    server localhost:5000;
    keepalive 64;
}

server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;

    client_max_body_size 100M;

    location / {
        proxy_pass http://daniel_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    location /ws {
        proxy_pass http://daniel_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
    }
}
NGINX_EOF

# Replace domain placeholder
sudo sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/nginx/sites-available/$DOMAIN

# Enable Nginx site
sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN

# Remove default Nginx site
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
echo -e "${YELLOW}✓ Testing Nginx configuration...${NC}"
sudo nginx -t

# Reload Nginx
sudo systemctl enable nginx
sudo systemctl reload nginx

# Install SSL certificate with Let's Encrypt
echo -e "${YELLOW}🔒 Setting up SSL certificate...${NC}"
sudo apt-get install -y certbot python3-certbot-nginx

sudo certbot --nginx \
  -d "$DOMAIN" \
  --non-interactive \
  --agree-tos \
  -m "$EMAIL" \
  --redirect \
  --hsts \
  2>/dev/null || echo "⚠️  SSL setup skipped - configure manually if needed"

# Setup firewall
echo -e "${YELLOW}🔥 Configuring firewall...${NC}"
sudo apt-get install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# Create monitoring script
echo -e "${YELLOW}📊 Setting up monitoring...${NC}"
sudo tee /usr/local/bin/monitor-daniel-ai > /dev/null <<'MONITOR_EOF'
#!/bin/bash
# Monitor script for DANIEL AI
# Run: monitor-daniel-ai
# Displays app status and logs

echo "=== DANIEL AI Status ==="
pm2 status

echo ""
echo "=== Recent Logs (last 50 lines) ==="
pm2 logs daniel-ai --lines 50 --nostream

echo ""
echo "=== Disk Usage ==="
df -h

echo ""
echo "=== Memory Usage ==="
free -h
MONITOR_EOF

sudo chmod +x /usr/local/bin/monitor-daniel-ai

# Display summary
echo ""
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE!${NC}"
echo ""
echo "==================================================="
echo -e "${GREEN}🎉 DANIEL AI is now running!${NC}"
echo "==================================================="
echo ""
echo -e "🌍 Application URL: ${BLUE}https://$DOMAIN${NC}"
echo -e "📊 Monitor app: ${BLUE}monitor-daniel-ai${NC}"
echo ""
echo "Useful Commands:"
echo "  pm2 status              # Check app status"
echo "  pm2 logs $APP_NAME       # View application logs"
echo "  pm2 restart $APP_NAME    # Restart app"
echo "  pm2 stop $APP_NAME       # Stop app"
echo "  sudo systemctl reload nginx  # Reload web server"
echo ""
echo "Important:"
echo "  ⚠️  Change PostgreSQL password: sudo -u postgres psql"
echo "  ⚠️  Update DATABASE_URL environment variable"
echo "  ⚠️  Set your AI provider API keys in settings"
echo ""
echo "Logs:"
echo "  Application: /home/$APP_USER/.pm2/logs/"
echo "  Nginx: /var/log/nginx/"
echo "  PostgreSQL: /var/log/postgresql/"
echo ""

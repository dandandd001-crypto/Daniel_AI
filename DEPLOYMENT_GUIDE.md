# DANIEL AI DEV - Ubuntu Deployment Guide

This guide will help you deploy DANIEL AI DEV on your Ubuntu cloud server.

## Prerequisites

- Ubuntu 20.04+ server with root access
- Domain name (optional, for SSL)
- At least 2GB RAM, 20GB disk space

## Quick Start

### 1. Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Install PostgreSQL

```bash
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql << EOF
CREATE USER danielai WITH PASSWORD 'your_secure_password';
CREATE DATABASE danielai_db OWNER danielai;
GRANT ALL PRIVILEGES ON DATABASE danielai_db TO danielai;
EOF
```

### 3. Install PM2 (Process Manager)

```bash
sudo npm install -g pm2
```

### 4. Clone/Upload Your Project

```bash
# Create app directory
sudo mkdir -p /var/www/danielai
cd /var/www/danielai

# Upload your project files here (use scp, rsync, or git)
# Example with git:
# git clone <your-repo-url> .

# Or copy from your local machine:
# scp -r /path/to/project/* user@your-server:/var/www/danielai/
```

### 5. Install Dependencies

```bash
cd /var/www/danielai
npm install
```

### 6. Configure Environment

```bash
# Create environment file
cat > .env << EOF
DATABASE_URL=postgresql://danielai:your_secure_password@localhost:5432/danielai_db
NODE_ENV=production
PORT=3000
PROJECTS_DIR=/var/www/danielai/projects
EOF

# Create projects directory
mkdir -p /var/www/danielai/projects
chmod 755 /var/www/danielai/projects
```

### 7. Push Database Schema

```bash
npm run db:push
```

### 8. Build the Application

```bash
npm run build
```

### 9. Start with PM2

```bash
pm2 start npm --name "danielai" -- start
pm2 save
pm2 startup
```

### 10. Install Nginx (Reverse Proxy)

```bash
sudo apt-get install -y nginx

# Create Nginx config
sudo cat > /etc/nginx/sites-available/danielai << 'EOF'
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain or IP

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        
        # WebSocket support
        proxy_read_timeout 86400;
    }
}
EOF

# Enable site
sudo ln -sf /etc/nginx/sites-available/danielai /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### 11. Setup SSL with Let's Encrypt (Optional but Recommended)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Firewall Configuration

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

## Management Commands

```bash
# View logs
pm2 logs danielai

# Restart application
pm2 restart danielai

# Stop application
pm2 stop danielai

# View status
pm2 status
```

## Updating the Application

```bash
cd /var/www/danielai

# Pull new changes (if using git)
git pull

# Install dependencies
npm install

# Rebuild
npm run build

# Push database changes
npm run db:push

# Restart
pm2 restart danielai
```

## Security Best Practices

1. **Firewall**: Only expose ports 22, 80, and 443
2. **SSL**: Always use HTTPS in production
3. **Database**: Use strong passwords
4. **Updates**: Regularly update your server: `sudo apt update && sudo apt upgrade`
5. **Backups**: Regularly backup your database and project files

## Troubleshooting

### Application Won't Start
```bash
# Check PM2 logs
pm2 logs danielai --lines 100

# Check if port is in use
sudo lsof -i :3000
```

### Database Connection Issues
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check connection
psql -U danielai -h localhost -d danielai_db
```

### Nginx Errors
```bash
# Test config
sudo nginx -t

# Check logs
sudo tail -f /var/log/nginx/error.log
```

## File Structure on Server

```
/var/www/danielai/
├── dist/              # Built application
├── node_modules/      # Dependencies
├── projects/          # User projects (isolated directories)
├── .env               # Environment variables
├── package.json
└── ...
```

## Support

For issues and feature requests, contact the developer.

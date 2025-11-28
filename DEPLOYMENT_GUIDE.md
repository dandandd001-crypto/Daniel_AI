# DANIEL AI DEV - Complete Ubuntu Server Deployment Guide

**Created:** November 28, 2025
**For Redeployment:** November 2025+

This is the complete step-by-step deployment guide used to successfully deploy Daniel AI DEV on Ubuntu server at 13.222.109.97 with domain danielai.mooo.com.

---

## Prerequisites

- Ubuntu 20.04+ server with SSH access
- A domain name (with DNS pointing to your server IP)
- At least 2GB RAM, 20GB disk space
- Git installed on your machine (for cloning repo)

---

## STEP 1: Update System & Install Core Dependencies

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install PM2 globally (process manager)
sudo npm install -g pm2

# Install Nginx (reverse proxy)
sudo apt install -y nginx

# Install Certbot for SSL certificates
sudo apt install -y certbot python3-certbot-nginx
```

---

## STEP 2: Set Up PostgreSQL Database

```bash
# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Connect to PostgreSQL as root user
sudo -u postgres psql
```

**Inside PostgreSQL shell (psql>), run these commands:**

```sql
CREATE USER daniel-ai_user WITH PASSWORD 'YOUR_SECURE_PASSWORD_HERE';
CREATE DATABASE daniel-ai_db OWNER daniel-ai_user;
ALTER ROLE daniel-ai_user SET client_encoding TO 'utf8';
ALTER ROLE daniel-ai_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE daniel-ai_user SET default_transaction_deferrable TO on;
ALTER ROLE daniel-ai_user SET default_transaction_read_only TO off;
\q
```

**IMPORTANT:** Replace `YOUR_SECURE_PASSWORD_HERE` with a strong, random password. Save this password for Step 4.

---

## STEP 3: Clone Repository & Install Dependencies

```bash
# Create deployment directory
sudo mkdir -p /var/www/danielai
sudo chown ubuntu:ubuntu /var/www/danielai
cd /var/www/danielai

# Clone your repository
git clone https://github.com/YOUR_GITHUB_USERNAME/Daniel_AI.git
cd Daniel_AI

# Install Node.js dependencies
npm install

# Build the application
npm run build
```

---

## STEP 4: Configure Environment Variables

```bash
# Create .env file in /var/www/danielai/Daniel_AI/
cat > .env << EOF
NODE_ENV=production
DATABASE_URL=postgresql://daniel-ai_user:YOUR_SECURE_PASSWORD_HERE@localhost:5432/daniel-ai_db
PORT=5000
EOF
```

**IMPORTANT:** 
- Replace `YOUR_SECURE_PASSWORD_HERE` with the actual password from STEP 2
- This file should NEVER be committed to git
- Never share this file with others

**Verify the file was created:**
```bash
cat .env
```

---

## STEP 5: Set Up PM2 Process Manager

```bash
# Start the application with PM2
pm2 start npm --name "daniel-ai" -- run dev

# Verify it's running
pm2 list
pm2 logs daniel-ai --lines 20
```

**Expected Output:** 
- App should show "Server starting..."
- Should show "DATABASE_URL exists: true"
- Port should be listening on 5000

**If there are errors:**
```bash
# Check full logs
pm2 logs daniel-ai --lines 100
```

**Save PM2 configuration:**
```bash
pm2 save
```

**Set up PM2 to auto-start on system boot:**
```bash
sudo pm2 startup systemd -u ubuntu --hp /home/ubuntu
# This will output a command - copy and run it
# Then run:
sudo pm2 save
```

---

## STEP 6: Configure Nginx as Reverse Proxy (HTTP only first)

```bash
# Create Nginx configuration file
sudo tee /etc/nginx/sites-available/danielai.mooo.com > /dev/null << 'EOF'
upstream daniel_ai {
    server 127.0.0.1:5000;
}

server {
    listen 80;
    server_name danielai.mooo.com;
    
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
    }
}
EOF
```

**Enable the Nginx site:**
```bash
sudo ln -sf /etc/nginx/sites-available/danielai.mooo.com /etc/nginx/sites-enabled/danielai.mooo.com
sudo rm -f /etc/nginx/sites-enabled/default
```

**Test Nginx configuration:**
```bash
sudo nginx -t
```

Expected output: `configuration file /etc/nginx/nginx.conf syntax is ok`

**Restart Nginx:**
```bash
sudo systemctl restart nginx
sudo systemctl enable nginx
```

**Note:** Replace `danielai.mooo.com` with your actual domain name

---

## STEP 7: Set Up SSL Certificate with Let's Encrypt

```bash
# Stop Nginx temporarily (port 80 needed for certificate validation)
sudo systemctl stop nginx

# Get SSL certificate from Let's Encrypt
sudo certbot certonly --standalone -d danielai.mooo.com --non-interactive --agree-tos -m your-email@example.com
```

Expected output: 
```
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/danielai.mooo.com/fullchain.pem
Key is saved at: /etc/letsencrypt/live/danielai.mooo.com/privkey.pem
```

---

## STEP 8: Update Nginx for HTTPS

```bash
# Update Nginx configuration for HTTPS
sudo tee /etc/nginx/sites-available/danielai.mooo.com > /dev/null << 'EOF'
upstream daniel_ai {
    server 127.0.0.1:5000;
}

server {
    listen 80;
    server_name danielai.mooo.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name danielai.mooo.com;
    
    ssl_certificate /etc/letsencrypt/live/danielai.mooo.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/danielai.mooo.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
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
    }
}
EOF
```

**Test Nginx configuration:**
```bash
sudo nginx -t
```

**Start Nginx:**
```bash
sudo systemctl start nginx
```

---

## STEP 9: Verify Deployment

```bash
# Check PM2 status
pm2 list

# Check app logs
pm2 logs daniel-ai --lines 20

# Test app on localhost
curl http://localhost:5000/

# Test app over HTTPS locally
curl -k https://localhost/

# Test app over public domain (HTTPS)
curl -k https://danielai.mooo.com/
```

All commands should return HTML content without errors.

---

## STEP 10: Set Up Automatic SSL Certificate Renewal

```bash
# Certbot automatically sets up renewal timer
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Test renewal (dry run - won't actually renew)
sudo certbot renew --dry-run
```

Certbot will automatically renew certificates 30 days before expiry.

---

## Management Commands

### View Application Status
```bash
pm2 list
pm2 logs daniel-ai
pm2 monit
```

### Restart Application
```bash
pm2 restart daniel-ai
```

### Stop Application
```bash
pm2 stop daniel-ai
```

### Check Nginx Status
```bash
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

### Database Connection Test
```bash
psql -U daniel-ai_user -h localhost -d daniel-ai_db -c "SELECT 1"
```

---

## Updating the Application

```bash
cd /var/www/danielai/Daniel_AI

# Pull latest code from repository
git pull origin main

# Install any new dependencies
npm install

# Rebuild application
npm run build

# Restart with PM2
pm2 restart daniel-ai

# Check logs to confirm restart
pm2 logs daniel-ai --lines 20
```

---

## Database Backup & Restore

### Backup Database
```bash
pg_dump -U daniel-ai_user daniel-ai_db > ~/backup_$(date +%Y%m%d).sql
```

### Restore Database
```bash
psql -U daniel-ai_user daniel-ai_db < ~/backup_20250128.sql
```

---

## Troubleshooting

### App Not Starting / No Projects Creating
**Check logs:**
```bash
pm2 logs daniel-ai --lines 100
```

**Common issues:**
- DATABASE_URL not set correctly in .env
- Database user doesn't have permissions
- Port 5000 already in use: `sudo lsof -i :5000`

### Nginx Connection Refused
```bash
# Restart both services
sudo systemctl restart nginx
pm2 restart daniel-ai

# Wait a few seconds for services to start
sleep 3

# Test again
curl -k https://danielai.mooo.com/
```

### SSL Certificate Issues
```bash
# Check certificate validity
sudo certbot certificates

# View certificate details
sudo openssl x509 -in /etc/letsencrypt/live/danielai.mooo.com/cert.pem -text -noout
```

### Database Connection Failed
```bash
# Verify PostgreSQL is running
sudo systemctl status postgresql

# Test connection directly
psql -U daniel-ai_user -h localhost -d daniel-ai_db -c "SELECT 1"

# Check .env DATABASE_URL format
cat /var/www/danielai/Daniel_AI/.env
```

---

## Security Checklist

- [ ] Use strong, randomly generated database password
- [ ] Keep .env file NEVER committed to git
- [ ] Enable firewall (UFW): `sudo ufw allow 22,80,443/tcp && sudo ufw enable`
- [ ] Use SSH keys instead of password authentication
- [ ] Regularly update system: `sudo apt update && sudo apt upgrade`
- [ ] Keep Node.js and PostgreSQL updated
- [ ] Enable automated SSL renewal (done in Step 10)
- [ ] Backup database regularly

---

## Quick Reference - All Commands

```bash
# 1. System + Dependencies
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs postgresql postgresql-contrib nginx
sudo npm install -g pm2
sudo apt install -y certbot python3-certbot-nginx

# 2. PostgreSQL Setup
sudo systemctl start postgresql
sudo -u postgres psql  # Then run CREATE commands from STEP 2

# 3. Clone & Setup
sudo mkdir -p /var/www/danielai
sudo chown ubuntu:ubuntu /var/www/danielai
cd /var/www/danielai
git clone <YOUR_REPO>
cd Daniel_AI
npm install && npm run build

# 4. Environment
cat > .env << EOF
NODE_ENV=production
DATABASE_URL=postgresql://daniel-ai_user:PASSWORD@localhost:5432/daniel-ai_db
PORT=5000
EOF

# 5. PM2
pm2 start npm --name "daniel-ai" -- run dev
pm2 save

# 6-8. Nginx + SSL (see steps 6, 7, 8)

# 9. Verify
pm2 list && curl -k https://danielai.mooo.com/
```

---

## Support Resources

- **PM2 Docs**: pm2.io
- **Nginx Docs**: nginx.org
- **Certbot**: certbot.eff.org
- **PostgreSQL**: postgresql.org

---

**Deployment Complete!**
Your Daniel AI application is now live at `https://danielai.mooo.com/`

**Last Updated:** November 28, 2025

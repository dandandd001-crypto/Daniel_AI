# DANIEL AI - Universal Deployment Guide

Deploy DANIEL AI to any cloud platform safely and reliably.

## Quick Start

Choose your platform below and follow the specific instructions.

---

## 🐧 Ubuntu / Debian Linux (Recommended)

### Automatic Deployment (Fastest)

```bash
# 1. SSH into your Ubuntu server
ssh user@your-server-ip

# 2. Download the deployment script
wget https://your-app-url/DEPLOY_UBUNTU.sh
chmod +x DEPLOY_UBUNTU.sh

# 3. Run deployment
./DEPLOY_UBUNTU.sh your-domain.com your-email@example.com

# Example:
./DEPLOY_UBUNTU.sh app.example.com admin@example.com
```

### Manual Deployment

If you prefer step-by-step control, follow [MANUAL_DEPLOY.md](./MANUAL_DEPLOY.md)

---

## ☁️ Cloud Platforms

### AWS EC2

1. **Create Ubuntu 20.04+ instance** (t3.medium or larger recommended)
2. **Open ports:** 22 (SSH), 80 (HTTP), 443 (HTTPS)
3. **SSH in:** `ssh -i your-key.pem ubuntu@ec2-instance-ip`
4. **Run deployment script** (see Ubuntu section above)

### DigitalOcean

1. **Create Ubuntu 20.04+ Droplet** ($12/month or higher)
2. **Enable UFW firewall** from Droplet Settings
3. **SSH in:** `ssh root@your-droplet-ip`
4. **Run deployment script** (see Ubuntu section above)

### Google Cloud Platform

1. **Create Compute Engine VM** (Ubuntu 20.04 LTS)
2. **Configure firewall rules** to allow ports 80, 443
3. **SSH in** via Cloud Console
4. **Run deployment script** (see Ubuntu section above)

### Azure

1. **Create Ubuntu 20.04+ Virtual Machine**
2. **Configure NSG** to allow ports 80, 443
3. **SSH in:** `ssh azureuser@your-vm-ip`
4. **Run deployment script** (see Ubuntu section above)

### Heroku

Heroku is not recommended for this app due to:
- Ephemeral file storage (projects deleted after restart)
- Limited execution time for background processes
- Higher costs

**Alternative:** Use Railway, Render, or Fly.io (similar setup)

### Docker (Any Platform)

```bash
# Build Docker image
docker build -t daniel-ai .

# Run container
docker run -p 5000:5000 \
  -e DATABASE_URL=postgresql://user:pass@db:5432/db \
  -e AI_PROVIDER=openai \
  -e AI_API_KEY=your-key \
  daniel-ai

# Use Docker Compose for full stack (coming soon)
```

---

## 🔒 Security Best Practices

### Before Deployment

- [ ] Change all default passwords
- [ ] Generate strong API keys for AI providers
- [ ] Update domain DNS records to point to your server
- [ ] Create SSL certificate (automatic with deployment script)
- [ ] Configure firewall to allow only necessary ports

### After Deployment

```bash
# 1. Update PostgreSQL password
sudo -u postgres psql
ALTER USER daniel_ai_user WITH PASSWORD 'new_strong_password';

# 2. Update environment variables
sudo nano /etc/environment
# Add: DATABASE_URL=postgresql://user:password@localhost/db
# Add: AI_PROVIDER=openai
# Add: AI_API_KEY=sk-xxxxx

# 3. Setup SSH key authentication (disable password login)
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
# Set: PermitRootLogin no

sudo systemctl restart ssh

# 4. Enable automatic updates
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# 5. Setup monitoring/alerting
pm2 install pm2-auto-pull
pm2 install pm2-monitor
```

---

## 📊 Post-Deployment Monitoring

### Check Application Status

```bash
# View all processes
pm2 status

# View application logs (last 100 lines)
pm2 logs daniel-ai --lines 100

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Monitor database
sudo -u postgres psql -c "SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database;"
```

### Setup Log Rotation

```bash
# Log rotation is automatic with pm2
# Check PM2 logs location: ~/.pm2/logs/

# To view old logs
ls ~/.pm2/logs/
```

### Enable System Monitoring

```bash
# Install Fail2Ban (prevent brute force attacks)
sudo apt-get install -y fail2ban

# Install Glances (system monitoring)
sudo apt-get install -y glances

# Run Glances
glances
```

---

## 🚀 Updating the Application

### Pull Latest Changes

```bash
cd /home/app/apps/daniel-ai
git pull origin main
npm install
npm run build
pm2 restart daniel-ai
```

### Automated Updates (Optional)

```bash
# Install pm2-auto-pull
pm2 install pm2-auto-pull

# Configure in ~/.pm2/conf.js to auto-deploy on git updates
```

---

## 🔄 Backup & Recovery

### Backup Database

```bash
# Manual backup
sudo -u postgres pg_dump daniel_ai_db > backup.sql

# Automated daily backup (add to crontab)
0 2 * * * sudo -u postgres pg_dump daniel_ai_db | gzip > /backups/db_$(date +\%Y\%m\%d).sql.gz

# Restore from backup
sudo -u postgres psql daniel_ai_db < backup.sql
```

### Backup Application Files

```bash
# Backup project directory
tar -czf daniel-ai-backup.tar.gz /home/app/apps/daniel-ai/

# Upload to cloud storage (AWS S3, GCS, etc.)
aws s3 cp daniel-ai-backup.tar.gz s3://your-bucket/backups/
```

---

## 🆘 Troubleshooting

### Application won't start

```bash
# Check logs
pm2 logs daniel-ai

# Restart
pm2 restart daniel-ai

# Check Node.js installation
node --version

# Check port 5000 is not in use
sudo lsof -i :5000
```

### Nginx 502 Bad Gateway

```bash
# Check upstream service
pm2 status

# Restart app
pm2 restart daniel-ai

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log
```

### Database connection errors

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Test connection
psql -h localhost -U daniel_ai_user -d daniel_ai_db -c "SELECT 1;"

# Check environment variables
env | grep DATABASE_URL
```

### SSL Certificate issues

```bash
# Renew SSL (auto-renews, but manual renewal)
sudo certbot renew --dry-run

# Force renewal
sudo certbot renew --force-renewal

# Check certificate expiry
sudo certbot certificates
```

---

## 🔧 Custom Configuration

### Environment Variables

Create `/etc/environment.daniel-ai`:

```bash
DATABASE_URL=postgresql://user:password@localhost/db
AI_PROVIDER=openai
AI_API_KEY=sk-xxxxx
NODE_ENV=production
PORT=5000
```

Load in PM2 ecosystem file:

```bash
pm2 start ecosystem.config.js
```

### Custom Domain

Update Nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/your-domain.com
# Update server_name

sudo systemctl reload nginx
```

---

## 📝 Maintenance Checklist

- [ ] Weekly: Check logs for errors
- [ ] Weekly: Verify backups are running
- [ ] Monthly: Update system packages (`apt update && apt upgrade`)
- [ ] Monthly: Check SSL certificate expiry
- [ ] Quarterly: Review and update security settings
- [ ] Quarterly: Test disaster recovery procedures

---

## 💰 Estimated Costs

| Platform | Instance Size | Monthly Cost | Notes |
|----------|---------------|--------------|-------|
| AWS EC2 | t3.medium | ~$30 | + storage + data transfer |
| DigitalOcean | $12 Droplet | $12 | + backups |
| GCP | e2-medium | ~$25 | + storage |
| Azure | B2s | ~$30 | + storage |
| Linode | Nanode | $5 | Basic tier only |

---

## 📞 Support

For issues:
1. Check logs: `pm2 logs`
2. Check Nginx: `sudo systemctl status nginx`
3. Check database: `sudo systemctl status postgresql`
4. Review troubleshooting section above

---

## 🎉 Next Steps

After deployment:
1. ✅ Visit your app at `https://your-domain.com`
2. ✅ Create your first project
3. ✅ Add your AI provider API key
4. ✅ Start building!


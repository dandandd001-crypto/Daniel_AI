# DANIEL AI DEV - Code Export Guide

This guide explains how to export and transfer your DANIEL AI DEV application to another server or environment.

## Method 1: Git Repository (Recommended)

### On Your Current Server/Environment

```bash
# Initialize git if not already done
git init

# Add all files
git add .

# Commit
git commit -m "Export DANIEL AI DEV"

# Add remote (use your own repository)
git remote add origin https://github.com/yourusername/danielai.git

# Push
git push -u origin main
```

### On Your New Server

```bash
git clone https://github.com/yourusername/danielai.git /var/www/danielai
cd /var/www/danielai
npm install
npm run build
```

## Method 2: Direct File Transfer

### Create Export Archive

```bash
# On source machine
cd /path/to/danielai

# Create archive (excluding node_modules and projects data)
tar -czvf danielai-export.tar.gz \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='projects/*' \
    --exclude='.env' \
    .
```

### Transfer to New Server

```bash
# Using SCP
scp danielai-export.tar.gz user@new-server:/var/www/

# On new server
cd /var/www
mkdir danielai
cd danielai
tar -xzvf ../danielai-export.tar.gz
```

## Method 3: Rsync (Best for Updates)

```bash
# Initial sync
rsync -avz --exclude 'node_modules' \
           --exclude 'dist' \
           --exclude 'projects' \
           --exclude '.env' \
           /source/danielai/ user@new-server:/var/www/danielai/

# For updates
rsync -avz --exclude 'node_modules' \
           --exclude 'dist' \
           --exclude 'projects' \
           --exclude '.env' \
           --delete \
           /source/danielai/ user@new-server:/var/www/danielai/
```

## After Export: Setup on New Server

### 1. Install Dependencies

```bash
cd /var/www/danielai
npm install
```

### 2. Configure Environment

Create `.env` file with your configuration:

```bash
cat > .env << EOF
DATABASE_URL=postgresql://user:password@localhost:5432/database
NODE_ENV=production
PORT=3000
PROJECTS_DIR=/var/www/danielai/projects
EOF
```

### 3. Setup Database

```bash
# Create database (PostgreSQL)
sudo -u postgres psql << EOF
CREATE DATABASE danielai_db;
CREATE USER danielai WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE danielai_db TO danielai;
EOF

# Push schema
npm run db:push
```

### 4. Build Application

```bash
npm run build
```

### 5. Start Application

```bash
# Using PM2
pm2 start npm --name "danielai" -- start
pm2 save

# Or using systemd (see DEPLOYMENT_GUIDE.md)
```

## Exporting Project Data

If you want to export user projects and their data:

### Export Projects and Database

```bash
# Export projects directory
tar -czvf projects-backup.tar.gz projects/

# Export database
pg_dump -U danielai danielai_db > database-backup.sql
```

### Import on New Server

```bash
# Import projects
tar -xzvf projects-backup.tar.gz -C /var/www/danielai/

# Import database
psql -U danielai danielai_db < database-backup.sql
```

## Docker Export (Alternative)

### Create Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

### Build and Export Docker Image

```bash
# Build image
docker build -t danielai:latest .

# Save to file
docker save danielai:latest > danielai-docker.tar

# Transfer to new server
scp danielai-docker.tar user@new-server:/tmp/

# On new server
docker load < /tmp/danielai-docker.tar
docker run -d -p 3000:3000 --env-file .env danielai:latest
```

## Files to Include in Export

**Always Include:**
- `client/` - Frontend source
- `server/` - Backend source
- `shared/` - Shared types/schemas
- `package.json` - Dependencies
- `package-lock.json` - Locked versions
- `tsconfig.json` - TypeScript config
- `vite.config.ts` - Vite config
- `drizzle.config.ts` - Database config
- `*.md` - Documentation

**Never Include (Sensitive/Generated):**
- `node_modules/` - Reinstall on target
- `dist/` - Rebuild on target
- `.env` - Contains secrets
- `projects/` - User data (export separately if needed)

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | postgresql://user:pass@localhost:5432/db |
| NODE_ENV | Environment mode | production |
| PORT | Server port | 3000 |
| PROJECTS_DIR | Directory for user projects | /var/www/danielai/projects |

## Verification Checklist

After export and setup on new server:

- [ ] All source files transferred
- [ ] `npm install` completed successfully
- [ ] `.env` configured with correct values
- [ ] Database created and schema pushed
- [ ] `npm run build` completed successfully
- [ ] Application starts without errors
- [ ] Can access web interface
- [ ] WebSocket connection works (chat functions)
- [ ] Projects can be created
- [ ] AI chat works (with valid API keys)

## Rollback Plan

Keep your export archive for at least 30 days after migration:

```bash
# Create dated backup
tar -czvf danielai-backup-$(date +%Y%m%d).tar.gz /var/www/danielai/

# Keep database backup
pg_dump -U danielai danielai_db > danielai-db-$(date +%Y%m%d).sql
```

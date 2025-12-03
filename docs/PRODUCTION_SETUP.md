# Production Setup Guide

Complete guide for deploying the scraper system on a VPS with Dolphin Anty and noVNC.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [VPS Setup](#vps-setup)
3. [Desktop + noVNC Setup](#desktop--novnc-setup)
4. [Dolphin Anty Setup](#dolphin-anty-setup)
5. [Deploy Application](#deploy-application)
6. [SSL Configuration](#ssl-configuration)
7. [Team Access](#team-access)
8. [Scaling Enrichment](#scaling-enrichment)
9. [Monitoring](#monitoring)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have:

1. **VPS Server**
   - Provider: DigitalOcean, Hetzner, Linode, or similar
   - Specs: 4GB RAM, 2 vCPU minimum
   - OS: Ubuntu 22.04 LTS
   - Cost: ~$24/month

2. **Domain Name**
   - `app.yourdomain.com` - Main application
   - `desktop.yourdomain.com` - Remote desktop access

3. **Dolphin Anty License**
   - Download from [dolphin-anty.com](https://dolphin-anty.com)

4. **Residential Proxy**
   - Provider: Bright Data, Oxylabs, or Smartproxy
   - Credentials ready

5. **Apollo Account**
   - Login credentials
   - 2FA backup codes if enabled

6. **MailTester API Keys**
   - At least one key
   - Multiple keys for scaling

---

## VPS Setup

### Option 1: Automated Setup

SSH into your VPS and run:

```bash
# Download and run setup script
curl -fsSL https://raw.githubusercontent.com/your-repo/scripts/vps-setup.sh | sudo bash
```

### Option 2: Manual Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Redis
sudo apt install -y redis-server
sudo systemctl enable redis-server

# Install Nginx
sudo apt install -y nginx
sudo systemctl enable nginx

# Install PM2
sudo npm install -g pm2

# Configure firewall
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

---

## Desktop + noVNC Setup

### Install Desktop Environment

```bash
# Install XFCE (lightweight)
sudo apt install -y xfce4 xfce4-goodies dbus-x11

# Install VNC server
sudo apt install -y tigervnc-standalone-server tigervnc-common

# Install noVNC
sudo apt install -y novnc websockify
```

### Configure VNC

```bash
# Set VNC password
vncpasswd

# Create startup script
mkdir -p ~/.vnc
cat > ~/.vnc/xstartup << 'EOF'
#!/bin/bash
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS
exec startxfce4 &
EOF
chmod +x ~/.vnc/xstartup
```

### Create Services

```bash
# VNC Server service
sudo tee /etc/systemd/system/vncserver.service << 'EOF'
[Unit]
Description=VNC Server
After=network.target

[Service]
Type=simple
User=root
ExecStartPre=/bin/sh -c '/usr/bin/vncserver -kill :1 > /dev/null 2>&1 || :'
ExecStart=/usr/bin/vncserver :1 -geometry 1920x1080 -depth 24 -localhost no
ExecStop=/usr/bin/vncserver -kill :1
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# noVNC service
sudo tee /etc/systemd/system/novnc.service << 'EOF'
[Unit]
Description=noVNC
After=vncserver.service

[Service]
Type=simple
ExecStart=/usr/bin/websockify --web=/usr/share/novnc/ 6080 localhost:5901
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable vncserver novnc
sudo systemctl start vncserver novnc
```

### Verify noVNC

Open in browser: `http://YOUR_VPS_IP:6080/vnc.html`

---

## Dolphin Anty Setup

### Install Dependencies

```bash
sudo apt install -y \
    libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    libcups2 libatspi2.0-0 libxss1 fonts-liberation
```

### Download and Install

1. Access VPS desktop via noVNC
2. Download Dolphin Anty from [dolphin-anty.com](https://dolphin-anty.com)
3. Extract and install

```bash
cd /opt/dolphin-anty
# Extract downloaded file
tar -xzf dolphin-anty-*.tar.gz
chmod +x dolphin-anty
```

### Create Apollo Profile

1. Launch Dolphin Anty in the VPS desktop
2. Create new profile:
   - Name: "Apollo Production"
   - OS: Linux
3. Configure proxy:
   - Type: HTTP/SOCKS5
   - Host, Port, Username, Password from your provider
4. Save profile
5. **Copy the Profile ID** (shown in profile list)
6. Start profile and manually login to Apollo
7. Complete any 2FA verification
8. Keep session active

### Get Profile ID

The Profile ID is visible in Dolphin Anty:
- In the profile list, check the ID column
- Or in the URL when editing a profile

---

## Deploy Application

### Clone Repository

```bash
cd /opt/scraper-app
git clone https://github.com/your-repo/web-app.git .
```

### Configure Environment

```bash
# Copy example file
cp .env.production.example .env.production

# Edit with your values
nano .env.production
```

**Required variables:**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key

# Scraper
SCRAPER_MODE=dolphin
DOLPHIN_ANTY_API_URL=http://localhost:3001
DOLPHIN_ANTY_PROFILE_ID=your-profile-id

# API Keys
MAILTESTER_API_KEY=your-key
# Add more for scaling
```

### Install and Build

```bash
npm install
npm run build
```

### Start with PM2

```bash
pm2 start npm --name "scraper" -- start
pm2 save
pm2 startup
```

---

## SSL Configuration

### Point DNS

Create A records:
- `app.yourdomain.com` → VPS IP
- `desktop.yourdomain.com` → VPS IP

Wait for DNS propagation (5-30 minutes).

### Get Certificates

```bash
sudo certbot --nginx -d app.yourdomain.com -d desktop.yourdomain.com
```

### Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/scraper
```

```nginx
# Main App
server {
    listen 443 ssl http2;
    server_name app.yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/app.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.yourdomain.com/privkey.pem;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
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

# noVNC Desktop
server {
    listen 443 ssl http2;
    server_name desktop.yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/desktop.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/desktop.yourdomain.com/privkey.pem;
    
    # Password protection
    auth_basic "Remote Desktop";
    auth_basic_user_file /etc/nginx/.htpasswd;
    
    location / {
        proxy_pass http://127.0.0.1:6080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}

# HTTP redirect
server {
    listen 80;
    server_name app.yourdomain.com desktop.yourdomain.com;
    return 301 https://$host$request_uri;
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/scraper /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Team Access

### Create noVNC Credentials

```bash
# Create password file
sudo htpasswd -c /etc/nginx/.htpasswd admin
# Enter password when prompted

# Add more users
sudo htpasswd /etc/nginx/.htpasswd teammate
```

### Share Access

Send to team members:
- **App URL**: `https://app.yourdomain.com`
- **Desktop URL**: `https://desktop.yourdomain.com`
- **Username/Password**: Created above

---

## Scaling Enrichment

### Add Multiple API Keys

Edit `.env.production`:

```bash
# Option 1: Numbered keys
MAILTESTER_API_KEY_1=key1
MAILTESTER_API_KEY_2=key2
MAILTESTER_API_KEY_3=key3

# Option 2: JSON array
MAILTESTER_API_KEYS='["key1","key2","key3"]'
```

### Capacity by Keys

| Keys | Emails/minute | Emails/hour |
|------|---------------|-------------|
| 1 | 340 | 20,400 |
| 3 | 1,020 | 61,200 |
| 5 | 1,700 | 102,000 |
| 10 | 3,400 | 204,000 |

### Restart Application

```bash
pm2 restart scraper
```

---

## Monitoring

### View Logs

```bash
# Application logs
pm2 logs scraper

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# VNC logs
journalctl -u vncserver -f
```

### Check Services

```bash
# Service status
sudo systemctl status nginx
sudo systemctl status redis-server
sudo systemctl status vncserver
sudo systemctl status novnc

# PM2 status
pm2 status
```

### Monitor Resources

```bash
htop
```

---

## Troubleshooting

### noVNC Not Loading

```bash
# Check VNC server
sudo systemctl status vncserver
sudo systemctl restart vncserver

# Check noVNC
sudo systemctl status novnc
sudo systemctl restart novnc

# Check logs
journalctl -u vncserver -n 50
journalctl -u novnc -n 50
```

### Dolphin Anty Won't Start

```bash
# Check if API is running
curl http://localhost:3001/browser_profiles

# Start manually in VNC
cd /opt/dolphin-anty
./dolphin-anty
```

### Application Errors

```bash
# Check PM2 logs
pm2 logs scraper --lines 100

# Restart application
pm2 restart scraper

# Check if port 3000 is in use
sudo lsof -i :3000
```

### SSL Certificate Issues

```bash
# Renew certificates
sudo certbot renew

# Check certificate status
sudo certbot certificates
```

### Redis Connection Failed

```bash
# Check Redis
sudo systemctl status redis-server
redis-cli ping  # Should return PONG

# Restart Redis
sudo systemctl restart redis-server
```

---

## Quick Reference

### URLs

| Service | URL |
|---------|-----|
| App | https://app.yourdomain.com |
| Desktop | https://desktop.yourdomain.com |
| Dolphin API | http://localhost:3001 (internal) |

### Commands

```bash
# Restart services
pm2 restart scraper
sudo systemctl restart nginx
sudo systemctl restart vncserver

# View logs
pm2 logs scraper
sudo tail -f /var/log/nginx/error.log

# Update application
cd /opt/scraper-app
git pull
npm install
npm run build
pm2 restart scraper
```

### File Locations

| File | Path |
|------|------|
| Application | /opt/scraper-app |
| Dolphin Anty | /opt/dolphin-anty |
| Nginx config | /etc/nginx/sites-available/scraper |
| Environment | /opt/scraper-app/.env.production |
| PM2 config | ~/.pm2 |

---

## Need Help?

1. Check logs first
2. Verify all services are running
3. Test Dolphin Anty API: `curl http://localhost:3001/browser_profiles`
4. Access VNC to manually inspect browser



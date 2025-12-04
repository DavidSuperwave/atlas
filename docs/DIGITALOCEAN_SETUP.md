# DigitalOcean VPS Setup Guide

Complete step-by-step guide to deploy your scraper on DigitalOcean.

---

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] DigitalOcean droplet created (Ubuntu 22.04, 4GB+ RAM)
- [ ] Droplet IP address
- [ ] SSH access to droplet
- [ ] Domain name (optional but recommended)
- [ ] Residential proxy credentials (recommended)
- [ ] MailTester API key
- [ ] Apollo account credentials

---

## Part 1: Initial Server Setup

### Step 1.1: SSH into your droplet

```bash
ssh root@YOUR_DROPLET_IP
```

### Step 1.2: Update system

```bash
apt update && apt upgrade -y
```

### Step 1.3: Install essential tools

```bash
apt install -y curl wget git build-essential unzip htop ufw
```

### Step 1.4: Configure firewall

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 6080/tcp  # noVNC (temporary, remove after SSL setup)
ufw --force enable
```

Verify firewall:
```bash
ufw status
```

---

## Part 2: Install Node.js & Tools

### Step 2.1: Install Node.js 18

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs
```

Verify:
```bash
node --version   # Should show v18.x.x
npm --version    # Should show 10.x.x
```

### Step 2.2: Install PM2 (process manager)

```bash
npm install -g pm2
```

### Step 2.3: Install Redis

```bash
apt install -y redis-server
systemctl enable redis-server
systemctl start redis-server
```

Verify:
```bash
redis-cli ping   # Should return PONG
```

### Step 2.4: Install Nginx

```bash
apt install -y nginx
systemctl enable nginx
systemctl start nginx
```

Verify:
```bash
systemctl status nginx   # Should show active (running)
```

---

## Part 3: Install Desktop Environment + noVNC

### Step 3.1: Install XFCE desktop and Firefox

```bash
apt install -y xfce4 xfce4-goodies dbus-x11 firefox
```

### Step 3.2: Remove problematic packages

Light-locker causes VNC sessions to crash. Remove it:

```bash
apt remove -y light-locker xfce4-screensaver
```

### Step 3.3: Install VNC server

```bash
apt install -y tigervnc-standalone-server tigervnc-common
```

### Step 3.4: Install noVNC

```bash
apt install -y novnc websockify
```

### Step 3.5: Set VNC password

```bash
vncpasswd
```

Enter a password when prompted (you'll use this to access the desktop).

### Step 3.6: Create VNC startup script

```bash
mkdir -p ~/.vnc

cat > ~/.vnc/xstartup << 'EOF'
#!/bin/bash
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS
exec startxfce4
EOF

chmod +x ~/.vnc/xstartup
```

### Step 3.7: Create VNC service

```bash
cat > /etc/systemd/system/vncserver.service << 'EOF'
[Unit]
Description=VNC Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root
ExecStartPre=/bin/sh -c '/usr/bin/vncserver -kill :1 > /dev/null 2>&1 || :'
ExecStart=/usr/bin/vncserver :1 -geometry 1920x1080 -depth 24 -localhost no
ExecStop=/usr/bin/vncserver -kill :1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
```

### Step 3.8: Create noVNC service

```bash
cat > /etc/systemd/system/novnc.service << 'EOF'
[Unit]
Description=noVNC Web Client
After=vncserver.service

[Service]
Type=simple
User=root
ExecStart=/usr/bin/websockify --web=/usr/share/novnc/ 6080 localhost:5901
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
```

### Step 3.9: Enable and start services

```bash
systemctl daemon-reload
systemctl enable vncserver novnc
systemctl start vncserver novnc
```

### Step 3.10: Test noVNC access

Open in your browser:
```
http://YOUR_DROPLET_IP:6080/vnc.html
```

Enter your VNC password. You should see the XFCE desktop!

---

## Part 4: Install Dolphin Anty

### Step 4.1: Install dependencies

```bash
apt install -y \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libcups2 \
    libatspi2.0-0 \
    libxss1 \
    fonts-liberation \
    libgtk-3-0
```

### Step 4.2: Create directory

```bash
mkdir -p /opt/dolphin-anty
cd /opt/dolphin-anty
```

### Step 4.3: Download Dolphin Anty

**Option A: Via noVNC browser**
1. Access noVNC: `http://YOUR_DROPLET_IP:6080/vnc.html`
2. Open Firefox in the desktop
3. Go to https://dolphin-anty.com/
4. Download the Linux version
5. Save to `/opt/dolphin-anty`

**Option B: Direct download (if link available)**
```bash
# Check Dolphin Anty website for latest Linux download link
wget "DOWNLOAD_LINK" -O dolphin-anty.tar.gz
tar -xzf dolphin-anty.tar.gz
```

### Step 4.4: Make executable

```bash
chmod +x /opt/dolphin-anty/dolphin-anty
# or whatever the executable is named
```

### Email Service (Resend) Configuration

Set these environment variables for the invite email system:

```bash
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@atlasv2.com
```

**Important:** The domain in `RESEND_FROM_EMAIL` (e.g., `atlasv2.com`) must be verified in your [Resend dashboard](https://resend.com/domains). Add the required DNS records and wait for verification before sending emails.

### Step 4.5: Launch Dolphin Anty

Via noVNC desktop:
1. Open terminal in XFCE
2. Run:
```bash
cd /opt/dolphin-anty
./dolphin-anty
```

### Step 4.6: Create Apollo profile

In Dolphin Anty:
1. Click "Create Profile"
2. Name: "Apollo Production"
3. **Configure Proxy** (if you have one):
   - Type: HTTP or SOCKS5
   - Host: your-proxy-host
   - Port: your-proxy-port
   - Username: your-username
   - Password: your-password
4. Click "Create"
5. **Copy the Profile ID** (you'll need this later)

### Step 4.7: Login to Apollo

1. Click "Start" on your profile
2. Navigate to https://app.apollo.io
3. Login with your Apollo credentials
4. Complete any 2FA verification
5. **Keep the browser open** - this saves the session

### Step 4.8: Get your Profile ID

In Dolphin Anty, your Profile ID is shown:
- In the profile list (ID column)
- Or in the URL when editing: `/profiles/PROFILE_ID/edit`

**Write this down!** You'll need it for environment variables.

### Step 4.9: Test Dolphin Anty API

```bash
curl http://localhost:3001/browser_profiles
```

Should return JSON with your profiles.

---

## Part 5: Deploy Your Application

### Step 5.1: Create app directory

```bash
mkdir -p /opt/scraper-app
cd /opt/scraper-app
```

### Step 5.2: Clone your repository

```bash
git clone https://github.com/YOUR_USERNAME/web-app.git .
```

Or upload files via SFTP.

### Step 5.3: Create environment file

```bash
nano .env.local
```

Add your configuration:
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Scraper Mode
SCRAPER_MODE=dolphin
DOLPHIN_ANTY_API_URL=http://localhost:3001
DOLPHIN_ANTY_PROFILE_ID=YOUR_PROFILE_ID_FROM_STEP_4.8

# MailTester API Keys
MAILTESTER_API_KEY=your-api-key

# Add more keys for scaling (optional)
# MAILTESTER_API_KEY_1=key1
# MAILTESTER_API_KEY_2=key2

# App URL (update after domain setup)
NEXT_PUBLIC_APP_URL=http://YOUR_DROPLET_IP:3000
```

Save: `Ctrl+X`, then `Y`, then `Enter`

### Step 5.4: Install dependencies

```bash
npm install
```

### Step 5.5: Build application

```bash
npm run build
```

### Step 5.6: Start with PM2

```bash
pm2 start npm --name "scraper" -- start
pm2 save
pm2 startup
```

### Step 5.7: Verify application

Open in browser:
```
http://YOUR_DROPLET_IP:3000
```

You should see your app!

---

## Part 6: Configure Domain + SSL (Recommended)

### Step 6.1: Point your domain to droplet

In your domain registrar (Namecheap, Cloudflare, etc.):

Create A records:
- `app.yourdomain.com` → YOUR_DROPLET_IP
- `desktop.yourdomain.com` → YOUR_DROPLET_IP

Wait 5-30 minutes for DNS propagation.

### Step 6.2: Install Certbot

```bash
apt install -y certbot python3-certbot-nginx
```

### Step 6.3: Create Nginx configuration

```bash
nano /etc/nginx/sites-available/scraper
```

Add:
```nginx
# Main App
server {
    listen 80;
    server_name app.yourdomain.com;
    
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
    listen 80;
    server_name desktop.yourdomain.com;
    
    location / {
        proxy_pass http://127.0.0.1:6080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

### Step 6.4: Enable site

```bash
ln -s /etc/nginx/sites-available/scraper /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default  # Remove default site
nginx -t  # Test configuration
systemctl reload nginx
```

### Step 6.5: Get SSL certificates

```bash
certbot --nginx -d app.yourdomain.com -d desktop.yourdomain.com
```

Follow prompts:
- Enter email
- Agree to terms
- Choose to redirect HTTP to HTTPS (option 2)

### Step 6.6: Add password protection for noVNC

```bash
apt install -y apache2-utils
htpasswd -c /etc/nginx/.htpasswd admin
```

Enter a password when prompted.

Update Nginx config:
```bash
nano /etc/nginx/sites-available/scraper
```

Add to the desktop server block (after `server_name`):
```nginx
    auth_basic "Remote Desktop";
    auth_basic_user_file /etc/nginx/.htpasswd;
```

Reload:
```bash
nginx -t
systemctl reload nginx
```

### Step 6.7: Update environment variable

```bash
nano /opt/scraper-app/.env.local
```

Update:
```bash
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com
```

Restart app:
```bash
pm2 restart scraper
```

### Step 6.8: Close temporary firewall port

```bash
ufw delete allow 6080/tcp
```

---

## Part 7: Run Database Migration

### Step 7.1: Login to Supabase

Go to your Supabase project dashboard.

### Step 7.2: Run SQL migration

Go to SQL Editor and run:

```sql
-- Add scraper_mode column to scrapes table
ALTER TABLE scrapes 
ADD COLUMN IF NOT EXISTS scraper_mode TEXT;

-- Add api_key_used column to leads table
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS api_key_used TEXT;

-- Create index for querying
CREATE INDEX IF NOT EXISTS idx_scrapes_scraper_mode ON scrapes(scraper_mode);
```

---

## Part 8: Final Testing

### Step 8.1: Test noVNC access

Open: `https://desktop.yourdomain.com`
- Enter username: `admin`
- Enter password: (from htpasswd)
- Enter VNC password

You should see the desktop!

### Step 8.2: Test app access

Open: `https://app.yourdomain.com`

You should see your scraper app!

### Step 8.3: Test Dolphin Anty connection

In the app, try starting a scrape. Check logs:
```bash
pm2 logs scraper
```

Should show:
```
[SCRAPER-FACTORY] Using scraper mode: dolphin
[DOLPHIN-CLIENT] Starting profile: YOUR_PROFILE_ID
```

### Step 8.4: Test enrichment

Start an enrichment job. Check logs for:
```
[API-KEY-POOL] Loaded 1 API key(s)
[VERIFICATION-QUEUE] Processing lead...
```

---

## Part 9: Team Access

### Step 9.1: Add team members to noVNC

```bash
htpasswd /etc/nginx/.htpasswd teammate1
htpasswd /etc/nginx/.htpasswd teammate2
```

### Step 9.2: Share credentials

Send to team:
- **App URL**: `https://app.yourdomain.com`
- **Desktop URL**: `https://desktop.yourdomain.com`
- **Username**: their username
- **Password**: their password
- **VNC Password**: the shared VNC password

---

## Part 10: Maintenance

### View logs

```bash
# Application logs
pm2 logs scraper

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# VNC logs
journalctl -u vncserver -f
```

### Restart services

```bash
# Restart app
pm2 restart scraper

# Restart VNC
systemctl restart vncserver

# Restart Nginx
systemctl restart nginx
```

### Update application

```bash
cd /opt/scraper-app
git pull
npm install
npm run build
pm2 restart scraper
```

### Monitor resources

```bash
htop
```

### Renew SSL (auto, but can force)

```bash
certbot renew
```

---

## Quick Reference

### Service Status

```bash
systemctl status nginx
systemctl status redis-server
systemctl status vncserver
systemctl status novnc
pm2 status
```

### Important Paths

| Item | Path |
|------|------|
| Application | `/opt/scraper-app` |
| Dolphin Anty | `/opt/dolphin-anty` |
| Environment | `/opt/scraper-app/.env.local` |
| Nginx config | `/etc/nginx/sites-available/scraper` |
| Nginx passwords | `/etc/nginx/.htpasswd` |
| VNC startup | `~/.vnc/xstartup` |

### URLs

| Service | URL |
|---------|-----|
| App | `https://app.yourdomain.com` |
| Desktop | `https://desktop.yourdomain.com` |
| Dolphin API | `http://localhost:3001` (internal) |

---

## Troubleshooting

### "Connection refused" on noVNC

```bash
systemctl status vncserver
systemctl restart vncserver
journalctl -u vncserver -n 50
```

### App not loading

```bash
pm2 logs scraper
pm2 restart scraper
```

### Dolphin Anty API not responding

1. Access VPS via noVNC
2. Check if Dolphin Anty is running
3. Restart Dolphin Anty manually

### SSL certificate issues

```bash
certbot renew --force-renewal
systemctl reload nginx
```

### Out of memory

```bash
# Check memory
free -h

# Restart services to free memory
pm2 restart scraper
systemctl restart vncserver
```

---

## Done! 🎉

Your production scraper is now running on DigitalOcean with:
- ✅ Next.js app with SSL
- ✅ Dolphin Anty anti-detect browser
- ✅ noVNC for remote desktop access
- ✅ Team access with password protection
- ✅ Scalable enrichment system

**Your URLs:**
- App: `https://app.yourdomain.com`
- Desktop: `https://desktop.yourdomain.com`


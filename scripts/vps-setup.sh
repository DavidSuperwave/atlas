#!/bin/bash
# =============================================================================
# VPS Setup Script for Production Scraper
# =============================================================================
# This script sets up a fresh Ubuntu 22.04 VPS with:
# - Node.js 18+
# - Redis
# - Nginx
# - XFCE Desktop + TigerVNC + noVNC
# - PM2 for process management
# - SSL certificates
#
# Usage: curl -fsSL https://your-url/vps-setup.sh | sudo bash
# Or: sudo bash vps-setup.sh
# =============================================================================

set -e

echo "=============================================="
echo "  VPS Setup Script - Production Scraper"
echo "=============================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (sudo)"
    exit 1
fi

# =============================================================================
# 1. System Update
# =============================================================================
echo ""
echo "1. Updating system packages..."
apt update && apt upgrade -y

# =============================================================================
# 2. Install Essential Tools
# =============================================================================
echo ""
echo "2. Installing essential tools..."
apt install -y \
    curl \
    wget \
    git \
    build-essential \
    unzip \
    htop \
    ufw

# =============================================================================
# 3. Configure Firewall
# =============================================================================
echo ""
echo "3. Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 6080/tcp  # noVNC
ufw --force enable
echo "Firewall configured"

# =============================================================================
# 4. Install Node.js 18
# =============================================================================
echo ""
echo "4. Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

# =============================================================================
# 5. Install PM2
# =============================================================================
echo ""
echo "5. Installing PM2..."
npm install -g pm2

# Configure PM2 to start on boot
pm2 startup systemd -u root --hp /root

# =============================================================================
# 6. Install Redis
# =============================================================================
echo ""
echo "6. Installing Redis..."
apt install -y redis-server

# Enable Redis on boot
systemctl enable redis-server
systemctl start redis-server

echo "Redis status: $(systemctl is-active redis-server)"

# =============================================================================
# 7. Install Nginx
# =============================================================================
echo ""
echo "7. Installing Nginx..."
apt install -y nginx

systemctl enable nginx
systemctl start nginx

echo "Nginx status: $(systemctl is-active nginx)"

# =============================================================================
# 8. Install Certbot (SSL)
# =============================================================================
echo ""
echo "8. Installing Certbot for SSL..."
apt install -y certbot python3-certbot-nginx

# =============================================================================
# 9. Install XFCE Desktop (Lightweight)
# =============================================================================
echo ""
echo "9. Installing XFCE Desktop..."
apt install -y xfce4 xfce4-goodies dbus-x11

# =============================================================================
# 10. Install TigerVNC
# =============================================================================
echo ""
echo "10. Installing TigerVNC..."
apt install -y tigervnc-standalone-server tigervnc-common

# =============================================================================
# 11. Install noVNC (Web-based VNC client)
# =============================================================================
echo ""
echo "11. Installing noVNC..."
apt install -y novnc websockify

# =============================================================================
# 12. Install Dolphin Anty Dependencies
# =============================================================================
echo ""
echo "12. Installing Dolphin Anty dependencies..."
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
    fonts-liberation

# =============================================================================
# 13. Create app user (optional, more secure)
# =============================================================================
echo ""
echo "13. Creating app directory..."
mkdir -p /opt/scraper-app
mkdir -p /opt/dolphin-anty

# =============================================================================
# 14. Create VNC password file
# =============================================================================
echo ""
echo "14. Setting up VNC..."
echo ""
echo "Please set a VNC password:"
vncpasswd

# Create VNC startup script
mkdir -p ~/.vnc
cat > ~/.vnc/xstartup << 'EOF'
#!/bin/bash
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS
exec startxfce4 &
EOF
chmod +x ~/.vnc/xstartup

# =============================================================================
# 15. Create systemd services
# =============================================================================
echo ""
echo "15. Creating systemd services..."

# VNC Server service
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

# noVNC service
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

# Enable services
systemctl daemon-reload
systemctl enable vncserver
systemctl enable novnc

# =============================================================================
# 16. Create Nginx config template
# =============================================================================
echo ""
echo "16. Creating Nginx config template..."

cat > /etc/nginx/sites-available/scraper-template << 'EOF'
# Scraper App Configuration
# Replace YOUR_DOMAIN with your actual domain

# HTTP -> HTTPS redirect
server {
    listen 80;
    server_name app.YOUR_DOMAIN desktop.YOUR_DOMAIN;
    
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    location / {
        return 301 https://$host$request_uri;
    }
}

# Main App (Next.js)
server {
    listen 443 ssl http2;
    server_name app.YOUR_DOMAIN;
    
    # SSL will be added by Certbot
    # ssl_certificate /etc/letsencrypt/live/app.YOUR_DOMAIN/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/app.YOUR_DOMAIN/privkey.pem;
    
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

# noVNC (Remote Desktop)
server {
    listen 443 ssl http2;
    server_name desktop.YOUR_DOMAIN;
    
    # SSL will be added by Certbot
    # ssl_certificate /etc/letsencrypt/live/desktop.YOUR_DOMAIN/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/desktop.YOUR_DOMAIN/privkey.pem;
    
    # Basic auth for security
    auth_basic "Remote Desktop";
    auth_basic_user_file /etc/nginx/.htpasswd;
    
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
EOF

echo "Nginx template created at /etc/nginx/sites-available/scraper-template"

# =============================================================================
# 17. Print Summary
# =============================================================================
echo ""
echo "=============================================="
echo "  Setup Complete!"
echo "=============================================="
echo ""
echo "Installed components:"
echo "  ✓ Node.js $(node --version)"
echo "  ✓ npm $(npm --version)"
echo "  ✓ PM2"
echo "  ✓ Redis"
echo "  ✓ Nginx"
echo "  ✓ Certbot"
echo "  ✓ XFCE Desktop"
echo "  ✓ TigerVNC"
echo "  ✓ noVNC"
echo ""
echo "Next steps:"
echo ""
echo "1. Start VNC and noVNC:"
echo "   sudo systemctl start vncserver"
echo "   sudo systemctl start novnc"
echo ""
echo "2. Access noVNC (temporary, before SSL):"
echo "   http://YOUR_SERVER_IP:6080/vnc.html"
echo ""
echo "3. Configure your domain DNS:"
echo "   app.yourdomain.com -> YOUR_SERVER_IP"
echo "   desktop.yourdomain.com -> YOUR_SERVER_IP"
echo ""
echo "4. Set up SSL certificates:"
echo "   sudo certbot --nginx -d app.yourdomain.com -d desktop.yourdomain.com"
echo ""
echo "5. Create noVNC password:"
echo "   sudo htpasswd -c /etc/nginx/.htpasswd admin"
echo ""
echo "6. Download and install Dolphin Anty:"
echo "   cd /opt/dolphin-anty"
echo "   # Download from https://dolphin-anty.com/"
echo ""
echo "7. Deploy your Next.js app:"
echo "   cd /opt/scraper-app"
echo "   git clone YOUR_REPO ."
echo "   npm install"
echo "   npm run build"
echo "   pm2 start npm --name 'scraper' -- start"
echo "   pm2 save"
echo ""
echo "=============================================="



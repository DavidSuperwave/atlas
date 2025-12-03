#!/bin/bash
# VNC Diagnostic Script
# Run this on your VPS: bash vnc-diagnostic.sh

echo "=========================================="
echo "VNC Diagnostic Check"
echo "=========================================="
echo ""

echo "1. VNC Server Status:"
echo "----------------------------------------"
systemctl status vncserver --no-pager | head -15
echo ""

echo "2. noVNC Status:"
echo "----------------------------------------"
systemctl status novnc --no-pager | head -15
echo ""

echo "3. Port Listening Check:"
echo "----------------------------------------"
ss -tlnp | grep -E '5901|6080' || echo "Ports 5901 or 6080 not listening!"
echo ""

echo "4. Firewall Status:"
echo "----------------------------------------"
ufw status | grep -E '6080|5901' || echo "Ports not in firewall rules!"
echo ""

echo "5. VNC Process Check:"
echo "----------------------------------------"
ps aux | grep -E 'Xtigervnc|vncserver' | grep -v grep || echo "No VNC processes found!"
echo ""

echo "6. noVNC Process Check:"
echo "----------------------------------------"
ps aux | grep -E 'websockify|novnc' | grep -v grep || echo "No noVNC processes found!"
echo ""

echo "7. Recent VNC Errors:"
echo "----------------------------------------"
journalctl -u vncserver -n 10 --no-pager
echo ""

echo "8. Recent noVNC Errors:"
echo "----------------------------------------"
journalctl -u novnc -n 10 --no-pager
echo ""

echo "=========================================="
echo "Diagnostic Complete"
echo "=========================================="



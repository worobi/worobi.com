#!/bin/bash
# =============================================================
#  deploy.sh — Upload & deploy Worobi.com family sites to VPS
#
#  Usage: bash deploy.sh
#  Run from inside your project folder (where index.html lives)
#
#  Prerequisites:
#    - SSH access to your VPS
#    - rsync installed locally and on VPS
#    - Set YOUR_VPS_IP and YOUR_VPS_USER below
# =============================================================

VPS_USER="root"      
VPS_IP="144.126.155.14"     
WEB_ROOT="/var/www"
PROJECT_DIR="$(dirname "$(cd "$(dirname "$0")"; pwd)")"

echo "📁 Project directory: $PROJECT_DIR"
echo "🚀 Deploying to $VPS_USER@$VPS_IP ..."

# Create remote directories
ssh "$VPS_USER@$VPS_IP" "
  sudo mkdir -p $WEB_ROOT/worobi.com
  sudo mkdir -p $WEB_ROOT/brandon.worobi.com
  sudo mkdir -p $WEB_ROOT/monica.worobi.com
  sudo mkdir -p $WEB_ROOT/nevaeh.worobi.com
  sudo mkdir -p $WEB_ROOT/alexander.worobi.com
  sudo mkdir -p $WEB_ROOT/lilian.worobi.com
  sudo mkdir -p $WEB_ROOT/theodore.worobi.com
  sudo mkdir -p $WEB_ROOT/jefferson.worobi.com
  sudo mkdir -p $WEB_ROOT/charlotte.worobi.com
  sudo mkdir -p $WEB_ROOT/notary.worobi.com
  sudo chown -R $VPS_USER:$VPS_USER $WEB_ROOT
"

# Upload main site
echo "→ Uploading worobi.com ..."
rsync -avz --exclude '_server' --exclude '*/index.html' \
  "$PROJECT_DIR/index.html" \
  "$VPS_USER@$VPS_IP:$WEB_ROOT/worobi.com/"

# Upload each member subdomain
for member in brandon monica nevaeh alexander lilian theodore jefferson charlotte notary; do
  echo "→ Uploading ${member}.worobi.com ..."
  rsync -avz "$PROJECT_DIR/${member}/" \
    "$VPS_USER@$VPS_IP:$WEB_ROOT/${member}.worobi.com/"
done

# Copy nginx config and reload
echo "→ Installing Nginx config ..."
rsync -avz "$PROJECT_DIR/_server/nginx.conf" \
  "$VPS_USER@$VPS_IP:/tmp/worobi.conf"

ssh "$VPS_USER@$VPS_IP" "
  sudo cp /tmp/worobi.conf /etc/nginx/sites-available/worobi.com
  sudo ln -sf /etc/nginx/sites-available/worobi.com /etc/nginx/sites-enabled/worobi.com
  sudo nginx -t && sudo systemctl reload nginx
"

echo ""
echo "✅ Deployment complete!"
echo "   Visit: https://worobi.com"

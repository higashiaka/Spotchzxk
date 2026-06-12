#!/bin/bash
set -e

echo "=== 배포 시작 ==="

# 점검 모드 진입
sudo touch /opt/spotchzxk/maintenance.flag
sudo nginx -s reload
echo "[1/5] 점검 모드 ON"

# 최신 코드 pull
cd /opt/spotchzxk
git pull
echo "[2/5] git pull 완료"

# 백엔드 빌드 및 재시작
cd /opt/spotchzxk/backend
sudo ./gradlew build -x test
sudo systemctl restart spotchzxk
echo "[3/5] 백엔드 배포 완료"

# Vite 프론트엔드 빌드
cd /opt/spotchzxk/frontend
npm install --silent
npm run build
echo "[4/5] 프론트엔드 빌드 완료"

# nginx 봇 감지 설정 적용
sudo tee /etc/nginx/sites-enabled/spotchzxk > /dev/null << 'NGINX_EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name 168.107.34.209 spotchzxk.xyz www.spotchzxk.xyz;

    set $maintenance 0;
    if (-f /opt/spotchzxk/maintenance.flag) {
        set $maintenance 1;
    }
    if ($cookie_preview_bypass = "spzxk2026") {
        set $maintenance 0;
    }
    if ($request_uri = "/preview-spzxk2026") {
        set $maintenance 0;
    }
    if ($maintenance = 1) {
        return 503;
    }

    error_page 503 @maintenance;
    location @maintenance {
        root /opt/spotchzxk/documents;
        rewrite ^(.*)$ /maintenance.html break;
    }

    location = /preview-spzxk2026 {
        add_header Set-Cookie "preview_bypass=spzxk2026; Path=/; HttpOnly";
        return 302 /;
    }

    root /opt/spotchzxk/frontend/dist;
    index index.html;

    set $is_bot 0;
    if ($http_user_agent ~* "Googlebot|bingbot|Slurp|DuckDuckBot|Baiduspider|facebookexternalhit|Twitterbot|LinkedInBot|WhatsApp|Telegram|Slack|Discord") {
        set $is_bot 1;
    }

    location ~ ^/stocks/([^/]+)$ {
        if ($is_bot = 1) {
            proxy_pass http://localhost:8080/og/stocks/$1;
            break;
        }
        try_files $uri /index.html;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /ws {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $http_connection;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}
NGINX_EOF

sudo nginx -t && sudo nginx -s reload
echo "[5/5] nginx 설정 완료"

# Next.js 서비스 비활성화 (사용 안 함)
sudo systemctl stop spotchzxk-next 2>/dev/null || true
sudo systemctl disable spotchzxk-next 2>/dev/null || true

# 점검 모드 해제
sudo rm /opt/spotchzxk/maintenance.flag
sudo nginx -s reload

echo ""
echo "=== 배포 완료 ==="
sudo systemctl is-active spotchzxk && echo "백엔드: 실행 중" || echo "백엔드: 오류"
sudo journalctl -u spotchzxk -n 3 --no-pager

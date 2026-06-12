#!/bin/bash
set -e

echo "=== 배포 시작 ==="

# 점검 모드 진입
sudo touch /opt/spotchzxk/maintenance.flag
sudo nginx -s reload
echo "[1/6] 점검 모드 ON"

# 최신 코드 pull
cd /opt/spotchzxk
git pull
echo "[2/6] git pull 완료"

# 백엔드 빌드 및 재시작
cd /opt/spotchzxk/backend
sudo ./gradlew build -x test
sudo systemctl restart spotchzxk
echo "[3/6] 백엔드 배포 완료"

# Next.js 빌드
cd /opt/spotchzxk/frontend-next
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null || true
sudo systemctl restart spotchzxk-next
echo "[4/6] Next.js 배포 완료"

# 기존 Vite 프론트엔드 빌드 (필요시)
# cd /opt/spotchzxk/frontend
# npm run build

# 점검 모드 해제
sudo rm /opt/spotchzxk/maintenance.flag
sudo nginx -s reload
echo "[5/6] 점검 모드 OFF"

echo "=== 배포 완료 ==="
sudo journalctl -u spotchzxk -n 5 --no-pager
sudo journalctl -u spotchzxk-next -n 5 --no-pager

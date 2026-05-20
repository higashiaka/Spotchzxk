#!/bin/bash
# 액면분할 실행 스크립트 — current_price > 200,000 종목 10:1
# 사용법: bash run_stock_split.sh
# DB 접속 정보는 앱과 동일한 환경변수 사용

set -e

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-spotchzxk}"
DB_USER="${DB_USERNAME:-root}"
DB_PASS="${DB_PASSWORD:-}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SQL_FILE="$SCRIPT_DIR/stock_split.sql"

if [ ! -f "$SQL_FILE" ]; then
    echo "ERROR: $SQL_FILE 파일을 찾을 수 없습니다."
    exit 1
fi

echo "=== 액면분할 실행 ==="
echo "DB: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
echo ""

if [ -n "$DB_PASS" ]; then
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$SQL_FILE"
elif [ "$DB_HOST" = "localhost" ] || [ "$DB_HOST" = "127.0.0.1" ]; then
    # 로컬 root는 auth_socket 인증 → sudo 필요
    sudo mysql -P "$DB_PORT" "$DB_NAME" < "$SQL_FILE"
else
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" < "$SQL_FILE"
fi

echo ""
echo "=== 완료. 서버 재시작 필요 (캐시 초기화) ==="

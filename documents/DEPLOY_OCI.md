# Spotchzxk — OCI VM 배포 가이드

## 전제 조건

- Oracle Cloud Infrastructure 계정
- OCI Compute Instance (Ubuntu 22.04 LTS 권장, VM.Standard.E2.1.Micro 이상)
- 도메인 또는 공인 IP
- Firebase 프로젝트의 `serviceAccountKey.json` 보유

---

## 1. OCI Compute 인스턴스 설정

### 1-1. 인스턴스 생성

OCI 콘솔 → Compute → Instances → Create Instance

- **Image**: Canonical Ubuntu 22.04
- **Shape**: VM.Standard.E2.1.Micro (무료) or VM.Standard3.Flex
- **SSH 키**: 로컬 공개키 등록

### 1-2. Security List 포트 개방

OCI 콘솔 → Networking → Virtual Cloud Networks → Security Lists → Ingress Rules 추가

| 포트 | 프로토콜 | 용도 |
|------|----------|------|
| 22   | TCP      | SSH  |
| 80   | TCP      | HTTP (Nginx) |
| 443  | TCP      | HTTPS (선택) |

> 백엔드 8080 포트는 Nginx 내부 프록시로만 접근하므로 외부에 열지 않아도 됩니다.

### 1-3. VM 방화벽 (iptables) 포트 개방

Oracle Linux/Ubuntu는 기본 iptables 규칙이 추가로 존재합니다.

```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

## 2. 서버 기본 환경 설치

SSH 접속 후 순서대로 실행합니다.

```bash
sudo apt update && sudo apt upgrade -y

# Java 17
sudo apt install -y openjdk-17-jdk

# Node.js 20 (프론트엔드 빌드용)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# MySQL 8.0
sudo apt install -y mysql-server

# Nginx
sudo apt install -y nginx

# 기타
sudo apt install -y git unzip
```

버전 확인:

```bash
java -version      # openjdk 17
node -v            # v20.x
mysql --version    # 8.0.x
```

---

## 3. MySQL 설정

```bash
sudo mysql
```

MySQL 프롬프트에서 실행:

```sql
CREATE DATABASE spotchzxk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'spotchzxk'@'localhost' IDENTIFIED BY '비밀번호_여기에_입력';
GRANT ALL PRIVILEGES ON spotchzxk.* TO 'spotchzxk'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> Flyway가 애플리케이션 최초 실행 시 스키마를 자동으로 생성합니다. 직접 DDL을 실행할 필요 없습니다.

---

## 4. 프로젝트 클론

```bash
cd /opt
sudo git clone https://github.com/higashiaka/Spotchzxk.git spotchzxk
sudo chown -R $USER:$USER /opt/spotchzxk
cd /opt/spotchzxk
```

---

## 5. Firebase serviceAccountKey.json 업로드

로컬 머신에서 SCP로 전송:

```bash
scp -i ~/.ssh/your_key serviceAccountKey.json ubuntu@<VM_공인IP>:/opt/spotchzxk/backend/serviceAccountKey.json
```

파일 권한 제한:

```bash
chmod 600 /opt/spotchzxk/backend/serviceAccountKey.json
```

---

## 6. 환경 변수 파일 생성

```bash
sudo nano /opt/spotchzxk/backend/.env
```

아래 내용 작성:

```dotenv
DB_HOST=localhost
DB_PORT=3306
DB_NAME=spotchzxk
DB_USERNAME=spotchzxk
DB_PASSWORD=비밀번호_여기에_입력

PORT=8080
CORS_ORIGIN=http://<VM_공인IP>
ADMIN_API_KEY=관리자키_여기에_입력

FIREBASE_SERVICE_ACCOUNT_PATH=/opt/spotchzxk/backend/serviceAccountKey.json
```

> 도메인이 있으면 `CORS_ORIGIN=https://yourdomain.com` 으로 설정하세요.

파일 권한 제한:

```bash
chmod 600 /opt/spotchzxk/backend/.env
```

---

## 7. 프론트엔드 빌드

```bash
cd /opt/spotchzxk/frontend

# .env 파일 생성
cat > .env << 'EOF'
VITE_FIREBASE_API_KEY=여기에_입력
VITE_FIREBASE_AUTH_DOMAIN=여기에_입력
VITE_FIREBASE_PROJECT_ID=여기에_입력
VITE_FIREBASE_STORAGE_BUCKET=여기에_입력
VITE_FIREBASE_MESSAGING_SENDER_ID=여기에_입력
VITE_FIREBASE_APP_ID=여기에_입력

VITE_API_BASE_URL=http://<VM_공인IP>
VITE_WS_URL=http://<VM_공인IP>/ws
EOF

npm install
npm run build
```

빌드 결과물은 `frontend/dist/` 에 생성됩니다.

---

## 8. 백엔드 빌드 및 JAR 생성

```bash
cd /opt/spotchzxk/backend
chmod +x gradlew
./gradlew bootJar -x test
```

빌드 완료 후 JAR 파일 위치 확인:

```bash
ls build/libs/*.jar
# spotchzxk-0.0.1-SNAPSHOT.jar
```

---

## 9. systemd 서비스 등록

```bash
sudo nano /etc/systemd/system/spotchzxk.service
```

아래 내용 작성:

```ini
[Unit]
Description=Spotchzxk Spring Boot Application
After=network.target mysql.service

[Service]
User=ubuntu
WorkingDirectory=/opt/spotchzxk/backend
EnvironmentFile=/opt/spotchzxk/backend/.env
ExecStart=/usr/bin/java -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8 -jar /opt/spotchzxk/backend/build/libs/spotchzxk-0.0.1-SNAPSHOT.jar
SuccessExitStatus=143
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

서비스 등록 및 시작:

```bash
sudo systemctl daemon-reload
sudo systemctl enable spotchzxk
sudo systemctl start spotchzxk

# 상태 확인
sudo systemctl status spotchzxk

# 로그 확인
sudo journalctl -u spotchzxk -f
```

---

## 10. Nginx 설정

```bash
sudo nano /etc/nginx/sites-available/spotchzxk
```

아래 내용 작성:

```nginx
server {
    listen 80;
    server_name <VM_공인IP>;  # 도메인이 있으면 도메인으로 교체

    # 점검 모드: /opt/spotchzxk/maintenance.flag 파일이 존재하면 503 반환
    if (-f /opt/spotchzxk/maintenance.flag) {
        return 503;
    }
    error_page 503 @maintenance;
    location @maintenance {
        root /opt/spotchzxk/documents;
        rewrite ^(.*)$ /maintenance.html break;
    }

    # 프론트엔드 정적 파일
    root /opt/spotchzxk/frontend/dist;
    index index.html;

    # SPA 라우팅 지원
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 백엔드 API 프록시
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # Do not pass user-supplied X-Forwarded-For through to the backend.
        # The backend trusts this header only from configured proxy CIDRs.
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket 프록시
    location /ws {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

적용:

```bash
sudo ln -s /etc/nginx/sites-available/spotchzxk /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 11. 동작 확인

```bash
# 백엔드 헬스 체크
curl http://localhost:8080/api/stocks

# Nginx를 통한 접근
curl http://<VM_공인IP>/api/stocks

# 프론트엔드 접근 (브라우저에서)
# http://<VM_공인IP>
```

---

## 12. 코드 수정 후 업데이트 배포

### 로컬에서 수정 → Git push → VM에서 pull 하는 기본 흐름

```
로컬 수정 → git commit → git push → VM에서 git pull → 빌드 → 재시작
```

---

### 12-1. 프론트엔드만 변경했을 때

React 컴포넌트, 스타일, API 호출 등 `frontend/src/` 내부를 수정한 경우.  
**백엔드 재시작 불필요**, Nginx reload도 불필요합니다.

```bash
cd /opt/spotchzxk
git pull

cd frontend
npm install          # package.json 변경 시에만 필요, 아니면 생략 가능
npm run build        # dist/ 재생성
```

빌드 후 브라우저에서 강제 새로고침(`Ctrl+Shift+R`)으로 확인합니다.

---

### 12-2. 백엔드만 변경했을 때

Java 소스(`backend/src/`), `application.yml`, Flyway 마이그레이션 파일을 수정한 경우.

```bash
cd /opt/spotchzxk
git pull

cd backend
./gradlew bootJar -x test     # JAR 재빌드

sudo systemctl restart spotchzxk

# 정상 재시작 확인 (Flyway 마이그레이션 로그 포함)
sudo journalctl -u spotchzxk -f
```

> **Flyway 마이그레이션 파일 추가 시**: `V12__...sql` 같이 새 파일을 추가하면 재시작 시 자동으로 실행됩니다. 기존 마이그레이션 파일 내용은 절대 수정하지 마세요.

---

### 12-3. 프론트엔드 + 백엔드 둘 다 변경했을 때

```bash
cd /opt/spotchzxk
git pull

# 프론트엔드 빌드
cd frontend
npm run build

# 백엔드 빌드 및 재시작
cd /opt/spotchzxk/backend
./gradlew bootJar -x test
sudo systemctl restart spotchzxk

# 로그 확인
sudo journalctl -u spotchzxk -f
```

---

### 12-4. 환경 변수(.env) 변경했을 때

```bash
sudo nano /opt/spotchzxk/backend/.env
# 값 수정 후 저장

sudo systemctl restart spotchzxk
```

---

### 12-5. 의존성(build.gradle / package.json) 변경했을 때

**백엔드 의존성 추가/변경:**

```bash
cd /opt/spotchzxk/backend
./gradlew bootJar -x test     # Gradle이 자동으로 새 라이브러리 다운로드 후 빌드
sudo systemctl restart spotchzxk
```

**프론트엔드 패키지 추가/변경:**

```bash
cd /opt/spotchzxk/frontend
npm install                   # node_modules 갱신
npm run build
```

---

### 업데이트 후 체크리스트

```bash
# 1. 서비스 실행 중인지 확인
sudo systemctl status spotchzxk

# 2. 최근 로그에 에러 없는지 확인
sudo journalctl -u spotchzxk -n 50 --no-pager

# 3. API 응답 확인
curl http://localhost:8080/api/stocks

# 4. 프론트엔드 확인 (브라우저)
# http://<VM_공인IP>
```

---

## 13. 점검 공지 올리기 / 내리기

점검 페이지 파일은 `documents/maintenance.html` 입니다.  
Nginx가 `/opt/spotchzxk/maintenance.flag` 파일의 존재 여부를 보고 점검 모드를 토글합니다.

### 점검 시작 (공지 올리기)

```bash
touch /opt/spotchzxk/maintenance.flag
sudo systemctl reload nginx
```

이후 모든 접속자에게 점검 페이지가 표시됩니다. **백엔드는 그대로 켜져 있어도 됩니다.**

### 점검 종료 (공지 내리기)

```bash
rm /opt/spotchzxk/maintenance.flag
sudo systemctl reload nginx
```

---

### 점검 종료 예정 시각 표시하기

`documents/maintenance.html` 하단 스크립트에서 주석을 해제하고 날짜를 입력합니다.

```html
<!-- maintenance.html -->
<script>
  const el = document.getElementById('time');
  const end = new Date('2025-06-01T03:00:00+09:00');  // ← 여기 수정
  if (end > new Date()) el.textContent = '예상 종료: ' + end.toLocaleString('ko-KR');
</script>
```

수정 후 VM에 반영:

```bash
# 로컬에서 수정한 경우
scp -i ~/.ssh/your_key documents/maintenance.html ubuntu@<VM_공인IP>:/opt/spotchzxk/documents/maintenance.html

# VM에서 직접 수정하는 경우
nano /opt/spotchzxk/documents/maintenance.html
```

> Nginx가 정적 파일을 직접 서빙하므로 **reload 없이 바로 반영**됩니다.

---

### 점검 중 백엔드 작업 흐름 예시

```bash
# 1. 점검 공지 올리기
touch /opt/spotchzxk/maintenance.flag && sudo systemctl reload nginx

# 2. 백엔드 업데이트 작업 수행
cd /opt/spotchzxk && git pull
cd backend && ./gradlew bootJar -x test
sudo systemctl restart spotchzxk

# 3. 정상 동작 확인
sudo journalctl -u spotchzxk -n 30 --no-pager
curl http://localhost:8080/api/stocks

# 4. 점검 공지 내리기
rm /opt/spotchzxk/maintenance.flag && sudo systemctl reload nginx
```

---

## 트러블슈팅

### 앱이 시작되지 않을 때
```bash
sudo journalctl -u spotchzxk -n 100 --no-pager
```

### MySQL 연결 실패
```bash
mysql -u spotchzxk -p spotchzxk
# 연결되면 DB 자체는 정상
```

### Flyway 마이그레이션 충돌
기존 DB를 초기화하려면 [documents/init_market.sql](init_market.sql) 참고.

### Nginx 502 Bad Gateway
```bash
sudo systemctl status spotchzxk   # 앱 실행 중인지 확인
curl http://localhost:8080/api/stocks  # 직접 접근 테스트
```

### OCI 포트 접근 불가
- OCI 콘솔 Security List Ingress Rules 확인
- `sudo iptables -L INPUT -n` 으로 방화벽 규칙 확인

---

## 14. Cloudflare 연결

> **전제 조건**: 도메인이 있어야 합니다. Cloudflare는 공인 IP만으로는 사용 불가.

전체 흐름:

```
사용자 → Cloudflare (HTTPS) → OCI VM Nginx (HTTP) → Spring Boot
```

---

### 14-1. Cloudflare에 도메인 등록

1. [cloudflare.com](https://cloudflare.com) 가입 → **Add a Site** → 도메인 입력
2. **Free** 플랜 선택
3. Cloudflare가 기존 DNS 레코드를 자동 스캔 → **Continue**

---

### 14-2. 네임서버 변경 (도메인 등록업체에서)

Cloudflare가 제시하는 네임서버 2개를 도메인 구매처(가비아, 후이즈, Namecheap 등)에서 교체합니다.

```
변경 전: ns1.registrar.com, ns2.registrar.com
변경 후: aria.ns.cloudflare.com, bob.ns.cloudflare.com  ← Cloudflare 대시보드에서 확인
```

> 전파 시간: 몇 분 ~ 최대 24시간

---

### 14-3. DNS A 레코드 설정

Cloudflare 대시보드 → **DNS** 탭에서 아래 레코드 추가:

| Type | Name | Content | Proxy Status |
|------|------|---------|--------------|
| A | `@` | `<OCI 공인IP>` | **Proxied (주황 구름)** |
| A | `www` | `<OCI 공인IP>` | Proxied |

---

### 14-4. SSL/TLS 모드 설정

Cloudflare 대시보드 → **SSL/TLS** → Encryption Mode → **Flexible** 선택

| 모드 | 설명 |
|------|------|
| Flexible | 사용자↔Cloudflare는 HTTPS, Cloudflare↔VM은 HTTP. VM에 인증서 불필요. |
| Full | Cloudflare↔VM도 HTTPS. VM에 자체 서명 인증서 필요. |
| Full (Strict) | Cloudflare↔VM도 HTTPS + 유효한 인증서 필요 (Cloudflare Origin Certificate 발급 가능). |

> VM에 SSL 인증서를 별도로 설치하지 않는다면 **Flexible**로 시작하세요.

---

### 14-5. WebSocket 활성화

Cloudflare 대시보드 → **Network** → **WebSockets** → **On**

---

### 14-6. VM 설정 업데이트

Cloudflare 연결 후 도메인에 맞게 아래 3곳을 수정합니다.

**① Nginx server_name 변경**

```bash
sudo nano /etc/nginx/sites-available/spotchzxk
```

```nginx
# 변경 전
server_name <VM_공인IP>;

# 변경 후
server_name yourdomain.com www.yourdomain.com;
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

**② 백엔드 .env 수정**

```bash
sudo nano /opt/spotchzxk/backend/.env
```

```dotenv
# 변경 전
CORS_ORIGIN=http://<VM_공인IP>

# 변경 후
CORS_ORIGIN=https://yourdomain.com
```

```bash
sudo systemctl restart spotchzxk
```

**③ 프론트엔드 .env 수정 후 재빌드**

```bash
nano /opt/spotchzxk/frontend/.env
```

```dotenv
# 변경 전
VITE_API_BASE_URL=http://<VM_공인IP>
VITE_WS_URL=http://<VM_공인IP>/ws

# 변경 후
VITE_API_BASE_URL=https://yourdomain.com
VITE_WS_URL=https://yourdomain.com/ws
```

```bash
cd /opt/spotchzxk/frontend
npm run build
```

---

### 14-7. 동작 확인

```bash
# 브라우저에서 확인
# https://yourdomain.com          → 프론트엔드 로드
# https://yourdomain.com/api/stocks → API 응답

# 자물쇠 아이콘(HTTPS) 확인 → Cloudflare SSL 적용됨
```

---

### Cloudflare 트러블슈팅

**도메인 접속이 안 될 때**
- Cloudflare DNS 탭에서 A 레코드 Proxy 상태 확인 (주황 구름이어야 함)
- 네임서버 변경이 전파되지 않은 경우 → `nslookup yourdomain.com` 으로 확인

**WebSocket 연결 실패**
- Cloudflare Network → WebSockets 활성화 여부 확인
- Nginx `/ws` location의 `proxy_http_version 1.1` 과 Upgrade 헤더 설정 확인

**CORS 에러**
- 백엔드 `.env`의 `CORS_ORIGIN` 값이 `https://yourdomain.com` 으로 정확히 설정되어 있는지 확인
- 변경 후 `sudo systemctl restart spotchzxk` 필수

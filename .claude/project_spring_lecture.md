---
name: spring-lecture-notes
description: 백엔드 실무 프로젝트 수업 교수 녹음본 요약 — Spring Boot 강의 주차별 핵심 내용
metadata: 
  node_type: memory
  type: project
  originSessionId: ddecf8ce-9f81-4618-88af-7c7d4f4bedd0
---

# 백엔드 실무 프로젝트 수업 (2026년 1학기)

강의 폴더: `c:\Users\jin05\OneDrive\Desktop\세뇌\교수 수업 녹음본\`
파일: 1주.txt ~ 13주.txt (8주 없음), 클로바노트로 녹음 후 Notion 연동

**Why:** 교수 말이 매우 빠르고 내용이 많아 복습 및 시험 대비용으로 녹음
**How to apply:** 수업 관련 질문 시 이 노트를 기준으로 답변 구성

---

## 수업 개요 (1주, 2026-03-05)

- **과목명:** 백엔드 실무 프로젝트
- **평가:** 중간고사(필기), 기말고사(개인 프로젝트, 발표 없음), 과제
- **기말 프로젝트:** 개인 프로젝트, 1대1 검사(매주), AI 사용 가능하나 개념 이해 필수
- **수업 방식:** 교재 없음, 실습 중심, 진도 빠름
- **목표:** Spring Boot + React 풀스택 구현 (REST API 방식)
- **복학생/React 미수강자:** 템플릿 뷰(Mustache/Thymeleaf) 방식으로 허용

---

## 주차별 핵심 내용

### 1주 (2026-03-05) — 웹 서비스 개요, 프론트엔드/백엔드 개념

- **웹 서비스:** HTTP 프로토콜로 클라이언트 Request → 서버가 처리 → Response
- **프론트엔드:** 클라이언트 사이드에서 실행되는 기술 (HTML, CSS, JavaScript)
- **백엔드:** 서버에서 실행되는 기술 (Servlet, Spring)
- **Static vs Dynamic 콘텐츠:** HTML 고정 내용 vs 서버에서 생성되는 내용(DB 연동)
- **템플릿 엔진:** JSP, Thymeleaf, Mustache — 서버 실행 코드 + HTML 혼합 문서
- **왜 REST API 방식으로 변화?** 모바일 등 다양한 OS/디바이스 → 서버는 JSON 데이터만 보내고, 클라이언트가 화면 렌더링
- **Node.js:** JS의 서버 실행 환경, 소규모 프로젝트에 사용 가능하나 보안 등 한계 있음
- **React:** JavaScript 프레임워크, 백엔드 응답 데이터를 화면에 렌더링하는 역할

---

### 2주 (2026-03-12) — Spring 특징, IoC/DI, Spring MVC

**스프링 3대 특징:**
1. **컨테이너 시스템** — 빈(Bean) 라이프사이클 관리 (서블릿 컨테이너의 서블릿 ↔ 스프링 컨테이너의 빈)
2. **IoC/DI** — 제어의 역행: 개발자 대신 시스템이 객체 생성 + 의존성 주입(DI)까지 수행
   - `@Autowired` → 스프링이 자동으로 관련 객체 생성하여 필드에 주입
3. **POJO(경량화)** — 특정 클래스 상속 전제 조건 없음 (비교: 서블릿은 HttpServlet 반드시 상속)

**스프링 vs 서블릿 컨테이너:**
- 스프링 시스템에서 서블릿 컨테이너는 사라지지 않음 — 함께 동작
- 부팅 순서: 서블릿 컨테이너 → DispatcherServlet → 스프링 컨테이너

**Spring MVC 아키텍처:**
- DispatcherServlet(프론트 컨트롤러) → HandlerMapping → Controller → ViewResolver → View

**스프링 프레임워크 vs 스프링 부트:**
- 부트: 서버 내장, XML 설정 제거(어노테이션만), 환경 설정 자동화
- 설정 파일: `application.properties`, `build.gradle`

---

### 3주 (2026-03-19) — 서블릿 리뷰 실습, MVC 구조 코드

- 서블릿: HTTP 서블릿 상속 필수, URL 매핑(`@WebServlet`), do GET/do POST 메서드
- Spring MVC 코드 실습: DispatcherServlet이 모든 `.do` 요청 수신 → HandlerMapping으로 컨트롤러 라우팅 → ViewResolver로 뷰 경로 완성(prefix + 문자열 + suffix)
- 컨트롤러 인터페이스 → `handleRequest()` 추상 메서드 → 업캐스팅으로 다형성

---

### 4주 (2026-03-26) — 스프링 부트 프로젝트 생성

- **생성 방법:** start.spring.io에서 초기 설정 후 다운로드
- **빌드 도구:** Gradle (기본)
- **IDE:** IntelliJ IDEA (스프링 부트 프로젝트 하나당 창 하나)
- **의존성(Dependency) 추가:**
  - Spring Web (스프링 MVC)
  - Mustache (템플릿 엔진)
  - Spring Data JPA (DB 연동)
  - H2 Database (인메모리 테스트 DB)
- **폴더 구조:**
  - `src/main/java/` — 자바 소스
  - `src/main/resources/templates/` — 뷰 문서(Mustache 등)
  - `src/main/resources/static/` — 정적 리소스(이미지, HTML)
  - `src/main/resources/application.properties` — 프로젝트 설정
  - `build.gradle` — 의존성 관리

---

### 5주 (2026-04-02) — 3 레이어드 아키텍처, 어노테이션

**3 Layered Architecture:**
1. **Presentation Layer** → `@Controller` — 클라이언트 요청 처리
2. **Service Layer** → `@Service` — 비즈니스 로직, 두 레이어 연결
3. **Data Access Layer** → `@Repository` — DB 연동 (DAO)

**빈 생성 어노테이션:**
- `@Component` — 빈인 건 알지만 역할 불명확
- `@Controller` — 프레젠테이션 레이어 컨트롤러
- `@Service` — 서비스 레이어
- `@Repository` — 데이터 액세스 레이어

**컨트롤러 메서드 매핑:**
- 스프링: 메서드 단위로 서비스 처리 (서블릿은 객체 단위)
- `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`
- 같은 URL도 메서드(GET/POST)가 다르면 각각 매핑 가능

**Bootstrap CSS:** CDN 방식으로 연동, NavBar/Carousel 컴포넌트 활용

---

### 6주 (2026-04-09) — DTO 자동 바인딩, 게시판 CRUD

- 스프링의 DTO 자동 바인딩: 매개변수에 DTO 타입 선언 → 스프링이 `getParameter()` + setter 자동 처리
- 게시판 URL 패턴: `/articles/new` (GET: 글쓰기 폼), `/articles/new` (POST: 저장)
- static 폴더에 이미지 등 정적 파일 위치, 경로는 `/static/` 이후로 표기
- 아티클 관련 컨트롤러는 `ArticleController` 클래스에 묶어서 관리

---

### 7주 (2026-04-16) — Lombok, JPA, 서비스 레이어

**Lombok 라이브러리:**
- `@Getter`, `@Setter`, `@Data`, `@AllArgsConstructor` 등 자동 생성
- JDK 21 → Lombok 버전 1.18.30
- `build.gradle`에 dependency 추가 + IntelliJ 플러그인 설치 필요

**DB 연동 라이브러리 비교:**
- Spring JDBC, MyBatis(쿼리 XML 분리), **JPA** (현재 주류) — 성격이 다른 것: Spring Web

**JPA:**
- `CrudRepository` 확장 → `save()`, `findById()`, `findAll()`, `delete()` 등 기본 제공
- 엔티티 클래스: `@Entity`, 필드 = 테이블 컬럼 매핑
- 인젝션 방법: setter 또는 생성자

---

### 9주 (2026-04-30) — 중간고사 리뷰

- 중간고사 서술형 출제 (디스패처 서블릿 스펠링 등 영어 오타 감점)
- 시험 출제 내역: H2 = DB 기술, Template 엔진 종류, VO/DTO, POJO, CrudRepository 메서드, POST 매핑
- JpaRepository vs CrudRepository: 시험에서 둘 다 정답 처리
- 시험 평균: 타 반 50~55점, 이 반 67점

---

### 10주 (2026-05-07) — Service Layer 도입, REST API 전환

**Service Layer가 필요한 이유:**
- 여러 컨트롤러가 하나의 Repository를 직접 참조 시 → 변경 시 모든 컨트롤러 수정 필요
- Service Layer가 Repository를 감싸면 → 컨트롤러는 Service만 호출하면 됨 (의존성 분리)

**REST API 방식 전환:**
- 기존: 컨트롤러 → 뷰 문서 응답 (템플릿 방식)
- 이후: `@RestController` → JSON 데이터를 HTTP 응답 바디에 담아 전송
- `ResponseEntity`: 응답 상태코드(200 OK, 400 Bad Request 등) + 바디 직접 구성

---

### 11주 (2026-05-14) — AOP, REST API CRUD 완성

**AOP (Aspect Oriented Programming):**
- 핵심 기능(비즈니스 로직) + 부가 기능(보안, 로깅, 트랜잭션) 분리
- 부가 기능을 특정 메서드 패턴에 자동 적용 (메서드 단위)
- `@Transactional` — AOP 기반 트랜잭션 관리

**REST API CRUD:**
- `@DeleteMapping("/api/articles/{id}")` + `@PathVariable Long id`
- `ResponseEntity` 빌더 패턴: `.status(HttpStatus.OK).body(...).build()`
- `@RestController` = `@Controller` + `@ResponseBody` (응답 바디에 자동 직렬화)

**부팅 시 순서:** 스프링 컨테이너 로딩 → `@ComponentScan` → 각 레이어 빈 메모리에 적재

**다음 계획:** Spring Security(인증/인가) + React 연동

---

### 12주 (2026-05-21) — React 프론트엔드 연동

- React 프로젝트 생성 후 스프링 부트 REST API와 연동
- **라우팅:** react-router-dom 라이브러리 (`npm i react-router-dom`)
- **HTTP 요청:** fetch → Axios로 대체 (`npm i axios`)
  - Axios: JSON 자동 변환, fetch보다 편리
- **비동기 처리:** Promise 기반, 싱글 스레드이지만 비동기로 동작
- **싱글 페이지 앱(SPA):** index.html + 번들 JS → 컴포넌트 트리로 화면 구성
- React에서 백엔드로 GET `/api/articles` 요청 → JSON 배열 수신 → 상태변수로 렌더링

---

### 13주 (2026-05-28) — Spring Security, 프로젝트 검사 시작

**Spring Security 개념:**
- **인증(Authentication):** 로그인 여부 확인
- **인가(Authorization):** 로그인된 사용자의 권한(관리자/일반 유저) 확인
- **Filter Chain:** 클라이언트 요청 → 서블릿 컨테이너 → 필터(인증) → DispatcherServlet → 인터셉터(인가) → 컨트롤러
- **UsernamePasswordAuthenticationToken:** 아이디+패스워드로 생성하는 인증 토큰
- **UserDetailsService:** DB(Repository) 연동하여 사용자 정보 조회 → 토큰과 비교
- **SecurityContext:** 인증 성공 시 세션처럼 보안 처리된 영역에 저장
- **JWT 토큰 방식:** 로그인 성공 시 인증서(토큰) 발급 → 클라이언트가 보관 → 이후 요청마다 토큰 첨부

**프로젝트 검사 (13주~14주):**
- 기술 스택 설명(프론트, 백엔드, DB)
- 화면 설계서(기획서) 제출
- DB는 H2 사용 불가, 실제 DBMS (MySQL 등) 필수
- AI 사용 가능하나 개념 이해 필수

---

## 기말 프로젝트 요구사항

- **기술 스택:** Spring Boot + React(또는 Mustache 허용) + 실제 DB
- **구성:** 3 Layered Architecture 적용
- **범위:** CRUD 기능, REST API, 인증(Spring Security 또는 JWT)
- **평가 방법:** 1대1 개인 검사, 개념 질문 포함
- **주제:** 창의적인 주제 권장 (AI로 아이디어만 구체화할 것)

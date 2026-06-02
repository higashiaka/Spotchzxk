---
name: project-code-style
description: "백엔드(Spring Boot)/프론트엔드(React) 프로젝트 코드 스타일 — 네이밍, 구조, 패턴, 의존성"
metadata: 
  node_type: memory
  type: project
  originSessionId: ddecf8ce-9f81-4618-88af-7c7d4f4bedd0
---

# 프로젝트 코드 스타일 가이드

프로젝트 위치: `c:\Users\jin05\OneDrive\Desktop\세뇌\`
- `백엔드 모음/example1/` — Spring Security Form Login + SSR(Mustache)
- `백엔드 모음/example2/` — Spring Security JWT + REST API
- `프론트 모음/article-frontend/` — React 게시판 프론트

**Why:** 기말 프로젝트와 예제 코드의 스타일을 일관되게 유지하기 위해 기록
**How to apply:** 코드 작성/리뷰 시 아래 스타일을 기준으로 제안할 것

---

## 백엔드 (Java / Spring Boot)

### 환경
- Spring Boot: 3.5.8
- Java: 17
- 빌드: Gradle
- DB: H2 (개발용 인메모리)
- 추가 라이브러리: Lombok, Spring Security, Spring Data JPA, Mustache, JJWT(example2)

### 패키지 구조
```
com.springsecurity.exampleX/
├── config/       SecurityConfig, JwtUtil, JwtFilter, PrincipalDetails, PrincipalDetailsService
├── controller/
├── service/
├── entity/
├── repository/
└── dto/
```

### 네이밍 컨벤션
- 클래스: PascalCase
- 메서드/변수: camelCase
- 상수: UPPER_SNAKE_CASE
- 패키지: 소문자

### 의존성 주입 — 생성자 주입 100%
```java
@Service
@RequiredArgsConstructor  // Lombok으로 final 필드 생성자 자동 생성
public class JoinService {
    private final UserRepository userRepository;
    private final BCryptPasswordEncoder bCryptPasswordEncoder;
}
```
- `@Autowired` 필드 주입 사용하지 않음
- 모든 의존성 필드는 `final`

### 엔티티 스타일
```java
@Entity
@Builder
@Getter                                              // Setter 없음 (불변)
@NoArgsConstructor(access = AccessLevel.PROTECTED)   // JPA 요구, 직접 생성 차단
@AllArgsConstructor
@Table(name="UserMember")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String loginId;

    @Enumerated(EnumType.STRING)   // Enum을 문자열로 저장
    private UserRole role;
}
```
- Setter 없음 — Builder 패턴으로만 생성
- Enum은 `EnumType.STRING` 사용
- `@Column`에 제약조건 명시

### Enum 스타일
```java
public enum UserRole {
    USER, ADMIN;
}
```

### DTO 스타일
```java
// 방법 1: 간단한 DTO
@Getter @Setter          // 한 줄에 나열
public class JoinDTO {
    private String loginId;
    private String password;
}

// 방법 2: @Data 통합 사용
@Data
public class LoginDTO {
    private String loginId;
    private String password;
}
```

### 컨트롤러 스타일

**Example1 — SSR (@Controller, Mustache 뷰)**
```java
@Controller
@RequiredArgsConstructor
public class MemberController {
    @GetMapping("/join")
    public String joinForm() {
        return "join";                  // templates/join.mustache
    }

    @PostMapping("/joinProc")
    public String joinProcess(JoinDTO joinDTO) {
        joinService.joinProcess(joinDTO);
        return "redirect:/login";
    }

    @GetMapping("/")
    public String index(Model model, @AuthenticationPrincipal PrincipalDetails p) {
        if (p != null) model.addAttribute("userName", p.getNickname());
        return "index";
    }
}
```

**Example2 — REST API (@RestController, ResponseEntity)**
```java
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class MemberController {
    @PostMapping("/join")
    public ResponseEntity<String> join(@RequestBody JoinDTO joinDTO) {
        joinService.joinProcess(joinDTO);
        return ResponseEntity.ok("회원가입 성공");
    }

    @PostMapping("/login")
    public ResponseEntity<String> login(@RequestBody LoginDTO loginDTO) {
        String token = joinService.login(loginDTO.getLoginId(), loginDTO.getPassword());
        return ResponseEntity.ok().body(token);
    }
}
```

### 예외 처리
```java
// 패턴 1: Optional + orElseThrow (주 패턴)
User user = userRepository.findByLoginId(username)
        .orElseThrow(() -> new UsernameNotFoundException("해당 아이디를 찾을 수 없습니다: " + username));

// 패턴 2: 조건 체크 후 조용히 종료
if (userRepository.existsByLoginId(joinDTO.getLoginId())) {
    return;   // 개선 필요 사항 — 원래는 예외 던져야 함
}

// 패턴 3: RuntimeException
throw new RuntimeException("비밀번호가 일치하지 않습니다.");
```

### 디버깅 로그
```java
System.out.println("1. 헤더 수신 확인: " + authorization);  // logger 미사용, println으로 디버깅
```

### Security 설정 패턴

**Example1 — Form Login + Session**
```java
http.formLogin(login -> login
    .loginPage("/login")
    .loginProcessingUrl("/loginProc")
    .usernameParameter("loginId")
    .defaultSuccessUrl("/", true)
);
http.logout(logout -> logout
    .logoutUrl("/logout")
    .logoutSuccessUrl("/")
    .invalidateHttpSession(true)
    .deleteCookies("JSESSIONID")
);
```

**Example2 — JWT + Stateless**
```java
http.csrf(AbstractHttpConfigurer::disable);
http.formLogin(AbstractHttpConfigurer::disable);
http.httpBasic(AbstractHttpConfigurer::disable);
http.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
http.addFilterBefore(new JwtFilter(userDetailsService, jwtUtil),
        UsernamePasswordAuthenticationFilter.class);
```

### PrincipalDetails 패턴
```java
public class PrincipalDetails implements UserDetails {
    private User user;

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        Collection<GrantedAuthority> col = new ArrayList<>();
        col.add(() -> "ROLE_" + user.getRole().name());  // 람다로 익명 클래스 대체 가능
        return col;
    }

    public String getNickname() { return user.getNickname(); }
    public boolean isAdmin() { return user.getRole() == UserRole.ADMIN; }
}
```

### JWT 유틸 패턴
```java
public String createToken(String loginId, String role) {
    Claims claims = Jwts.claims();
    claims.put("loginId", loginId);
    claims.put("role", role);
    return Jwts.builder()
            .setClaims(claims)
            .setIssuedAt(new Date())
            .setExpiration(new Date(System.currentTimeMillis() + expirationTime))
            .signWith(key, SignatureAlgorithm.HS256)
            .compact();
}

public boolean validateToken(String token) {
    try { parseClaims(token); return true; }
    catch (JwtException | IllegalArgumentException e) { return false; }
}
```

---

## 프론트엔드 (React)

### 환경
- React: 19.2.6
- 번들러: Vite
- 라우팅: React Router DOM v7
- HTTP: axios (fetch 미사용)
- CSS: 순수 CSS 파일 + 인라인 스타일 (CSS 모듈/Tailwind/styled-components 없음)
- 언어: JavaScript (TypeScript 미사용)

### 폴더 구조
```
article-frontend/src/
├── pages/
│   ├── Home.jsx
│   ├── ArticleList.jsx
│   ├── ArticleWrite.jsx
│   └── Notfound.jsx
├── App.jsx          (라우팅 + 중앙 상태 관리)
├── main.jsx         (엔트리 포인트)
├── App.css
└── index.css
```

### 컴포넌트 스타일 — 함수형 100%
```javascript
// 방법 1: function 선언식 (App.jsx, ArticleList.jsx)
export default function Home() {
  return <h1>홈 페이지</h1>;
}

// 방법 2: 화살표 함수 (Notfound.jsx)
const Notfound = () => <div>잘못된 페이지입니다.</div>;
export default Notfound;
```

### 상태 관리 — useState + Prop Drilling
```javascript
// App.jsx에서 중앙 집중식 상태 관리
function App() {
  const [boards, setBoards] = useState([]);
  const [inputs, setInputs] = useState({ title: '', content: '' });
  const [editingId, setEditingId] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);   // 새로고침 트리거 패턴

  // 불변 상태 업데이트 (스프레드 연산자)
  const onChange = (e) => setInputs({ ...inputs, [e.target.name]: e.target.value });

  // 새로고침 트리거
  const triggerRefresh = () => setRefreshTick(prev => prev + 1);
}
```

### HTTP 통신 — axios
```javascript
// GET (useEffect 내에서 데이터 페칭)
useEffect(() => {
  axios.get('/api/articles').then((res) => setBoards(res.data));
}, [refreshTick]);

// POST
await axios.post('/api/articles', inputs);

// PATCH
await axios.patch(`/api/articles/${editingId}`, inputs);

// DELETE
await axios.delete(`/api/articles/${id}`);
```
- `then()` 방식과 `async/await` 방식 혼용
- `try-catch` 없음 (에러 처리 미구현)
- 로딩 상태 없음

### 라우팅 패턴
```javascript
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";

// 선언형 라우팅
<Routes>
  <Route path="/" element={<Home />} />
  <Route path="/list" element={<ArticleList boards={boards} ... />} />
  <Route path="/write" element={<ArticleWrite inputs={inputs} ... />} />
  <Route path="*" element={<Notfound />} />
</Routes>

// 링크
<Link to="/list">[게시판 목록]</Link>

// 프로그래밍 방식 이동
const nav = useNavigate();
nav("/write");
```

### CSS 스타일링
```css
/* index.css - CSS 변수 활용 */
:root {
  --text: #6b6375;
  --bg: #fff;
  --accent: #aa3bff;
}

@media (prefers-color-scheme: dark) {
  :root { --bg: #16171d; }
}
```

```javascript
// 인라인 스타일 (간단한 경우)
<table style={{ width: '70%', textAlign: 'center', margin: '0 auto' }}>
```

### 조건부 렌더링 패턴
```javascript
{editingId ? "수정" : "새 글 작성"}
{editingId && <button onClick={() => setEditingId(null)}>취소</button>}
{boards.length > 0 ? boards.map(b => <tr key={b.id}>...</tr>) : <tr><td>없음</td></tr>}
```

### Props 전달 패턴
```javascript
<ArticleList
  boards={boards}
  onDelete={onDelete}
  onEdit={(b) => { setInputs({title: b.title, content: b.content}); setEditingId(b.id); }}
/>
```
- Context API, Redux, Zustand 미사용
- Prop Drilling 방식 (소규모 프로젝트)

---

## 핵심 요약

| 항목 | 백엔드 | 프론트엔드 |
|------|--------|-----------|
| 의존성 주입 | 생성자 주입 (`@RequiredArgsConstructor`) | — |
| 엔티티 | 불변, Builder 패턴, Setter 없음 | — |
| 예외 처리 | `Optional.orElseThrow()` | 없음 (개선 필요) |
| 상태 관리 | — | `useState` + Prop Drilling |
| HTTP | ResponseEntity | axios |
| 스타일 | Lombok 어노테이션 적극 활용 | CSS 파일 + 인라인 혼용 |
| 로깅 | `System.out.println` | — |

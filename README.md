# 모여

채널에 모여서 이야기하는 메신저. React(Vite) + Express + MySQL.

## 실행 방법

1. MySQL 서버를 켠다.
2. `server/.env.example` 을 `server/.env` 로 복사하고 MySQL 비밀번호를 적는다. (DB명 기본값: `moyeo_20519`)
   DB와 테이블은 서버가 시작될 때 자동으로 만들어진다.
3. 서버 실행

   ```bash
   cd server
   npm install
   npm start
   ```

4. 클라이언트 실행 (새 터미널)

   ```bash
   cd client
   npm install
   npm start
   ```

5. 브라우저에서 http://localhost:5173 접속

## 기능

| 구분 | 기능 | 위치 |
| --- | --- | --- |
| 회원 C | 회원가입 (비밀번호 bcrypt 암호화) | 사이드바 아래 `회원가입` |
| 회원 R | 로그인, 프로필 조회 | `로그인`, 닉네임 클릭 → 마이페이지 |
| 회원 U | 닉네임 / 상태 메시지 / 비밀번호 수정 | 마이페이지 `저장` |
| 회원 D | 회원 탈퇴 | 마이페이지 `회원 탈퇴` |
| 메시지 C | 로그인 상태에서만 작성 | 채널 하단 입력창 |
| 메시지 R | 모든 사용자의 메시지 전체 조회 (비로그인도 가능) | 각 채널 화면 |
| 메시지 U / D | 본인 메시지만 수정 / 삭제 | 메시지에 마우스를 올리면 버튼 표시 |
| JOIN ① | `messages JOIN users` — 메시지 + 작성자 닉네임·상태 메시지 | 각 채널 화면 |
| JOIN ② | `users LEFT JOIN messages` — 멤버별 메시지 수, 마지막 활동 | `멤버 활동` 메뉴 |

## 테이블

- `users` (id, username, password, nickname, status_msg, created_at)
- `messages` (id, user_id → users.id, channel, content, created_at, updated_at)

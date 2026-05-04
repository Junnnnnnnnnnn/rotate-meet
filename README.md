# 💕 rotate-meet

> 로테이션 소개팅 참가 신청 웹앱 (Next.js 16 + React 19)

신청 폼을 받아 **Supabase**에 저장하고, **Cloudflare R2**에 사진을 업로드하며, **Telegram 그룹**으로 운영팀에 알림을 보냅니다. 모든 운영(본인확인/거절/신분증 폐기/메모)은 Telegram 봇 인라인 버튼으로 처리합니다.

---

## 🛠 기술 스택

| 항목       | 버전                             |
| ---------- | -------------------------------- |
| Node.js    | 20 이상 권장                     |
| Next.js    | ^16.2.4 (App Router + Turbopack) |
| React      | ^19.2.5                          |
| TypeScript | ^6.0.3 (strict)                  |

**백엔드 인프라 (모두 무료 티어):**

- **Supabase** — PostgreSQL DB
- **Cloudflare R2** — 사진 객체 스토리지 (S3 호환)
- **Telegram Bot API** — 운영 알림 + 액션 처리

---

## 🚀 로컬 개발

```bash
npm install
cp .env.example .env.local   # 값 채워 넣기
npm run dev                  # http://localhost:3000
```

| 명령어          | 설명           |
| --------------- | -------------- |
| `npm run dev`   | 개발 서버 실행 |
| `npm run build` | 프로덕션 빌드  |
| `npm run start` | 빌드 결과 실행 |
| `npm run lint`  | 린트 검사      |

---

## 📁 프로젝트 구조

```
app/
├── components/
│   ├── App.tsx              # 라우팅 (state 기반: landing / form / success)
│   ├── Landing.tsx          # 랜딩 (?hero=default|centered|minimal)
│   ├── FormFlow.tsx         # 8단계 폼 진행 + 제출 로직
│   ├── steps.tsx            # 각 step 컴포넌트 + WheelPicker
│   └── Success.tsx          # 제출 완료 화면
├── api/
│   ├── submit/
│   │   └── route.ts         # 폼 제출 → R2 업로드 → DB insert → Telegram 알림
│   └── telegram/
│       └── webhook/
│           └── route.ts     # Telegram callback/명령어/메모 ForceReply 처리
├── globals.css → styles.css → colors_and_type.css
└── page.tsx, layout.tsx

lib/
├── supabase.ts              # service_role 클라이언트
├── r2.ts                    # S3-compatible client + upload/delete/presign
├── telegram.ts              # Bot API 래퍼 (sendMessage, editMessageText 등)
└── format-notification.ts   # 메시지 포맷 + 버튼 빌더 (submit/webhook 공유)
```

---

## 🔄 전체 흐름

### 신청 제출

```
사용자가 8단계 폼 작성 후 [제출하기]
  ↓
POST /api/submit (multipart/form-data)
  ├─▶ Cloudflare R2: face/body는 public 버킷, id는 private 버킷
  ├─▶ Supabase: signups 테이블 INSERT
  └─▶ Telegram: face 사진 → body 사진 → 정보+버튼 메시지
        - DB에 telegram message ID들 저장 (나중에 갱신용)
```

### 운영팀 처리 (Telegram 그룹 안)

상태 진화: `pending` → `normal` (본인확인) → `paid` (입금 완료)

| 버튼 (메시지)        | 조건                   | 동작                                                       |
| -------------------- | ---------------------- | ---------------------------------------------------------- |
| **[✓ 확인]**         | status=pending일 때만  | `status='normal'`, verified\_\* 채움 → 입금 대기 상태로    |
| **[💰 입금완료]**    | status=normal일 때만   | `status='paid'`, paid\_\* 채움 → 참가 확정                 |
| **[✗ 거절]**         | 항상                   | R2 사진 3장 + DB row 삭제, 사진 메시지 삭제, 메인 "거절됨" |
| **[🗑 신분증 폐기]** | photo_id_key 있을 때만 | R2 id 객체 삭제, photo*id*\*에 폐기 정보                   |
| **[💬 메모]**        | 항상                   | ForceReply → 답장으로 메모 → admin_memos에 append          |

### 그룹 채팅 명령어

| 명령                            | 응답                                                          |
| ------------------------------- | ------------------------------------------------------------- |
| `/status` 또는 `현황`           | 총 N건 / 🟡 본인확인 대기 / ✓ 입금 대기 / 💰 입금 완료 카운트 |
| `/list` 또는 `목록`             | 상태별 그룹핑 (대기/입금대기엔 전화번호+8자리ID 표시)         |
| `/paid abc12345 [def67890 ...]` | 8자리 ID로 배치 입금 처리 (status normal → paid)              |
| `/help` 또는 `도움말`           | 사용법 안내                                                   |

---

## 🔐 사진 처리 정책

| 사진 종류       | 버킷                                     | 접근 방식                                             | 폐기                                             |
| --------------- | ---------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| **얼굴 사진**   | `rotate-meet-public` (`face/{uuid}.jpg`) | 공개 R2.dev URL                                       | 보존                                             |
| **전신 사진**   | `rotate-meet-public` (`body/{uuid}.jpg`) | 공개 R2.dev URL                                       | 보존                                             |
| **신분증 사진** | `rotate-meet-private` (`id/{uuid}.jpg`)  | **Presigned URL (4시간 유효)** 링크만 Telegram에 전송 | 운영자가 [🗑 신분증 폐기] 버튼으로 **수동 삭제** |

> 신분증은 Telegram 채팅에 이미지가 직접 전송되지 않습니다. 운영자는 메시지 안의 "🪪 신분증 보기" 링크를 탭해 브라우저로 확인하고, 본인확인 끝나면 [🗑 신분증 폐기] 버튼으로 R2에서 삭제합니다.

---

## 🗃 Supabase 스키마

### ENUM 타입

| 타입              | 값                                         | 의미             |
| ----------------- | ------------------------------------------ | ---------------- |
| `participation_t` | `new`, `repeat`                            | 신규 / 재참가    |
| `prefer_age_t`    | `동갑`, `연상`, `연하`, `상관없음`         | 선호 이성 나이대 |
| `drink_t`         | `아메리카노`, `라떼`, `아이스티`, `탄산수` | 행사장 음료      |
| `channel_t`       | `인스타그램`, `친구 추천`, `검색`, `기타`  | 알게 된 경로     |
| `signup_status_t` | `pending`, `normal`, `paid`, `cancelled`   | 신청 처리 상태   |

### `signups` 테이블 컬럼

| 컬럼                     | 타입            | 의미                                                                          |
| ------------------------ | --------------- | ----------------------------------------------------------------------------- |
| **시스템 메타**          |                 |                                                                               |
| `id`                     | uuid PK         | 신청 고유 ID. R2 사진 키 이름에도 사용                                        |
| `created_at`             | timestamptz     | 신청 제출 시각                                                                |
| `updated_at`             | timestamptz     | 마지막 수정 시각 (트리거 자동 갱신)                                           |
| **Step 1 — 본인 확인**   |                 |                                                                               |
| `name`                   | text            | 실명 (1~50자)                                                                 |
| `phone`                  | text            | 연락처 (`010-0000-0000` 형식 강제)                                            |
| `birthdate`              | date            | 생년월일                                                                      |
| **Step 2 — 참가 이력**   |                 |                                                                               |
| `participation`          | participation_t | 신규/재참가                                                                   |
| **Step 3 — 신체/성향**   |                 |                                                                               |
| `height_cm`              | smallint        | 키 (140~210)                                                                  |
| `weight_kg`              | smallint        | 몸무게 (35~130)                                                               |
| `mbti`                   | text            | MBTI 4글자                                                                    |
| **Step 4 — 사진**        |                 |                                                                               |
| `photo_face_url`         | text            | 얼굴 사진 R2 공개 URL                                                         |
| `photo_body_url`         | text            | 전신 사진 R2 공개 URL                                                         |
| `photo_id_key`           | text            | 신분증 R2 비공개 키 (폐기 시 null)                                            |
| **Step 5 — 자기소개**    |                 |                                                                               |
| `job`                    | text            | 직업                                                                          |
| `ideal_tags`             | text[]          | 이상형 태그 (최대 5개)                                                        |
| `ideal_type_note`        | text            | 이상형 자유 서술                                                              |
| `strengths`              | text            | 본인 장점 (선택)                                                              |
| **Step 6 — 취향**        |                 |                                                                               |
| `prefer_age`             | prefer_age_t    | 선호 이성 나이대                                                              |
| `drink`                  | drink_t         | 음료                                                                          |
| `channel`                | channel_t       | 알게 된 경로                                                                  |
| **Step 7 — 선택 항목**   |                 |                                                                               |
| `insta`                  | text            | 인스타 ID                                                                     |
| `companion`              | text            | 동반 참석자 정보                                                              |
| **Step 8 — 동의**        |                 |                                                                               |
| `refund_agreed`          | boolean         | 환불 규정 동의 (true 강제)                                                    |
| **운영 — 본인확인**      |                 |                                                                               |
| `status`                 | signup_status_t | 처리 상태 (기본 `pending`)                                                    |
| `verified_at`            | timestamptz     | [✓ 확인] 누른 시각                                                            |
| `verified_by_id`         | bigint          | 확인 처리한 운영자 Telegram user_id                                           |
| `verified_by_name`       | text            | 운영자 표시 이름                                                              |
| **운영 — 입금 확인**     |                 |                                                                               |
| `paid_at`                | timestamptz     | [💰 입금완료] 누른 시각                                                       |
| `paid_by_id`             | bigint          | 입금 처리한 운영자 Telegram user_id                                           |
| `paid_by_name`           | text            | 운영자 표시 이름                                                              |
| **운영 — 신분증 폐기**   |                 |                                                                               |
| `photo_id_deleted_at`    | timestamptz     | 폐기 시각                                                                     |
| `photo_id_deleted_by_id` | bigint          | 폐기 처리한 운영자 Telegram user_id                                           |
| `photo_id_deleted_by`    | text            | 운영자 표시 이름                                                              |
| **운영 — 메모**          |                 |                                                                               |
| `admin_memos`            | jsonb           | 메모 배열 (append-only). 각 항목 `{text, author_id, author_name, created_at}` |
| **Telegram 연동**        |                 |                                                                               |
| `telegram_chat_id`       | bigint          | 알림 보낸 그룹 채팅 ID                                                        |
| `telegram_notify_msg_id` | bigint          | 인라인 버튼 달린 메인 메시지 ID                                               |
| `telegram_photo_msg_ids` | bigint[]        | face/body 사진 메시지 ID 배열 (REJECT 시 일괄 삭제용)                         |
| **부가 정보**            |                 |                                                                               |
| `metadata`               | jsonb           | 디버깅·분석용 (`hero_variant`, `user_agent`, `referrer`)                      |

### 인덱스

| 인덱스                         | 의미                                                                     |
| ------------------------------ | ------------------------------------------------------------------------ |
| `signups_created_at_idx`       | 최신순 정렬 가속                                                         |
| `signups_status_idx`           | status 필터 가속                                                         |
| `signups_phone_active_uidx`    | 활성 신청(`status <> 'cancelled'`) 한정 전화번호 unique → 중복 신청 차단 |
| `signups_photo_id_pending_idx` | 신분증 미폐기 건 부분 인덱스                                             |

### 보안 (RLS)

- **RLS 활성화 + 정책 0개** → `anon`/`authenticated` 모두 차단
- **`service_role` 키만** 서버 라우트에서 사용 (RLS 우회)
- ⚠️ **신규 테이블에는 GRANT를 수동으로 부여**해야 함:
  ```sql
  grant all on public.<테이블명> to service_role;
  ```
  Supabase 프로젝트 설정에서 "Automatically expose new tables"를 OFF로 두었기 때문 (보안상 권장).

---

# 📋 처음부터 셋업하는 가이드

## 1단계: Supabase 프로젝트

### 1-1. 계정 + 프로젝트 생성

1. https://supabase.com → **Start your project** → GitHub 로그인
2. **New project**:
   - Project name: `rotate-meet`
   - Database Password: 강력한 비밀번호 생성 → **메모 필수**
   - Region: `Northeast Asia (Seoul)`
   - Pricing Plan: Free
3. 약 2분간 프로비저닝 대기

### 1-2. 보안 설정 (3가지)

프로젝트 진입 후 처음 묻는 옵션:

| 옵션                                          | 설정          |
| --------------------------------------------- | ------------- |
| Enable Data API                               | ✅ ON         |
| Automatically expose new tables and functions | ❌ OFF (안전) |
| Enable automatic RLS                          | ✅ ON         |

### 1-3. 스키마 적용

좌측 **SQL Editor** → New query → 아래 전체 붙여넣고 **Run**:

```sql
-- ENUM 타입
create type participation_t as enum ('new', 'repeat');
create type prefer_age_t    as enum ('동갑', '연상', '연하', '상관없음');
create type drink_t         as enum ('아메리카노', '라떼', '아이스티', '탄산수');
create type channel_t       as enum ('인스타그램', '친구 추천', '검색', '기타');
create type signup_status_t as enum ('pending', 'normal', 'paid', 'cancelled');

-- 메인 테이블
create table public.signups (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  name            text not null check (char_length(name) between 1 and 50),
  phone           text not null check (phone ~ '^01[016789]-\d{3,4}-\d{4}$'),
  birthdate       date not null,
  participation   participation_t not null,
  height_cm       smallint not null check (height_cm between 140 and 210),
  weight_kg       smallint not null check (weight_kg between 35 and 130),
  mbti            text     not null check (mbti ~ '^[EI][NS][TF][JP]$'),
  photo_face_url  text not null,
  photo_body_url  text not null,
  photo_id_key    text,
  job             text not null check (char_length(job) between 1 and 100),
  ideal_tags      text[] not null default '{}' check (array_length(ideal_tags, 1) <= 5),
  ideal_type_note text,
  strengths       text,
  prefer_age      prefer_age_t not null,
  drink           drink_t      not null,
  channel         channel_t    not null,
  insta           text,
  companion       text,
  refund_agreed   boolean not null check (refund_agreed = true),
  status                 signup_status_t not null default 'pending',
  verified_at            timestamptz,
  verified_by_id         bigint,
  verified_by_name       text,
  paid_at                timestamptz,
  paid_by_id             bigint,
  paid_by_name           text,
  photo_id_deleted_at    timestamptz,
  photo_id_deleted_by_id bigint,
  photo_id_deleted_by    text,
  admin_memos     jsonb not null default '[]'::jsonb,
  telegram_chat_id        bigint,
  telegram_notify_msg_id  bigint,
  telegram_photo_msg_ids  bigint[],
  metadata        jsonb not null default '{}'::jsonb
);

-- 인덱스
create index signups_created_at_idx on public.signups (created_at desc);
create index signups_status_idx     on public.signups (status);
create unique index signups_phone_active_uidx
  on public.signups (phone) where status <> 'cancelled';
create index signups_photo_id_pending_idx
  on public.signups (created_at) where photo_id_key is not null;

-- updated_at 자동 갱신
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger signups_touch_updated_at
  before update on public.signups
  for each row execute function public.touch_updated_at();

-- RLS + service_role GRANT
alter table public.signups enable row level security;
grant all on public.signups to service_role;
grant usage on schema public to service_role;
```

### 1-4. 키 복사

좌측 **Project Settings** (⚙️) → **API Keys** 탭:

- **Project URL** (`https://xxxxx.supabase.co`) → `NEXT_PUBLIC_SUPABASE_URL`
- **Secret keys** → `service_role` 키 (또는 기본 secret) → `SUPABASE_SERVICE_ROLE_KEY`

---

## 2단계: Cloudflare R2

### 2-1. R2 활성화

1. https://dash.cloudflare.com → 가입/로그인
2. 좌측 **R2 Object Storage** → **Subscribe to R2 Plan** (결제 카드 등록 — 무료 한도 안에선 0원)
3. R2 대시보드 진입

### 2-2. 버킷 2개 생성

| 버킷 이름             | 용도                  |
| --------------------- | --------------------- |
| `rotate-meet-public`  | face/body 사진 (공개) |
| `rotate-meet-private` | 신분증 사진 (비공개)  |

각각 **Create bucket** → Location: `Asia-Pacific (APAC)` → 생성.

### 2-3. 공개 버킷 설정 (`rotate-meet-public`만)

#### Public Development URL 활성화

`rotate-meet-public` → **Settings** → **Public Development URL** → **Enable** → 입력란에 `allow` → 활성화 → URL 복사 (`https://pub-xxxxxxxx.r2.dev`)

#### CORS Policy

같은 페이지 **CORS Policy** → Add:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://rotate-meet.vercel.app"
    ],
    "AllowedMethods": ["GET"]
  }
]
```

> 또는 `["*"]`로 단순화 가능 (어차피 공개 데이터). 비공개 버킷은 CORS 설정 불필요.

### 2-4. API 토큰 발급

R2 메인 → **Manage R2 API Tokens** → **Create API token**:

- Token name: `rotate-meet-app`
- Permissions: **Object Read & Write**
- Specify bucket(s): **Apply to specific buckets only** → `rotate-meet-public` + `rotate-meet-private` 둘 다
- TTL: `Forever`
- Client IP filtering: 비워둠

발급 즉시 복사:

- **Access Key ID** → `CLOUDFLARE_R2_ACCESS_KEY_ID`
- **Secret Access Key** → `CLOUDFLARE_R2_SECRET_ACCESS_KEY` (한 번만 표시)
- Endpoint URL의 서브도메인 32자 → `CLOUDFLARE_ACCOUNT_ID`

(Token value, jurisdiction-specific endpoints는 사용 안 함)

---

## 3단계: Telegram 봇 + 운영팀 그룹

### 3-1. 봇 생성 (BotFather)

1. Telegram 앱 → 검색 `@BotFather` (파란 체크 공식)
2. `/newbot`
3. 봇 이름: `로테이션 소개팅 알림` (자유)
4. 봇 username: `rotate_meet_bot` (반드시 `_bot`으로 끝나야 함)
5. BotFather가 토큰 출력:
   ```
   1234567890:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
   → `TELEGRAM_BOT_TOKEN`

### 3-2. 봇 설정

같은 BotFather 채팅:

```
/setprivacy
```

→ 봇 선택 → **Disable** (그룹 메시지 받기 위해 필수)

### 3-3. 운영팀 그룹 생성

1. Telegram → **새 그룹** → 이름 `로테이션 소개팅 운영팀`
2. 봇을 멤버로 추가 (검색: `@rotate_meet_bot`)
3. 봇을 **관리자로 승격**:
   - 그룹 정보 → 멤버 → 봇 길게 누르기 → "관리자로 승격"
   - 권한: ☑️ 메시지 삭제, ☑️ 메시지 고정 (선택)

### 3-4. Chat ID 확인

운영팀 그룹에 봇한테 메시지 보내기:

```
@rotate_meet_bot 안녕
```

브라우저에서 (`{BOT_TOKEN}`만 본인 것으로):

```
https://api.telegram.org/bot{BOT_TOKEN}/getUpdates
```

JSON 응답에서:

```json
"chat": { "id": -1234567890, ... }   ← 음수 부호 포함, → TELEGRAM_CHAT_ID
```

### 3-5. Webhook Secret 생성

PowerShell:

```powershell
[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
```

→ 64자리 문자열 → `TELEGRAM_WEBHOOK_SECRET`

---

## 4단계: 환경변수 정리

`.env.local` (로컬 개발) 또는 Vercel 환경변수에 다음 11개:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

# Cloudflare R2
CLOUDFLARE_ACCOUNT_ID=8ca40619...
CLOUDFLARE_R2_ACCESS_KEY_ID=...
CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
CLOUDFLARE_R2_PUBLIC_BUCKET=rotate-meet-public
CLOUDFLARE_R2_PRIVATE_BUCKET=rotate-meet-private
R2_PUBLIC_BASE_URL=https://pub-xxxxxxxx.r2.dev

# Telegram
TELEGRAM_BOT_TOKEN=1234567890:AAxxx...
TELEGRAM_CHAT_ID=-1234567890
TELEGRAM_WEBHOOK_SECRET=64자리hex...
```

`.env.example` 파일이 템플릿으로 커밋되어 있으니 복사해 채우면 됩니다.

---

## 5단계: Vercel 배포

### 5-1. 첫 배포

```powershell
npx vercel
```

대화형 질문에 답하고 첫 배포 완료. 도메인: `https://rotate-meet.vercel.app` 등.

### 5-2. 환경변수 등록

Vercel 대시보드 → 프로젝트 → **Settings** → **Environments** → **Production** 선택 → **Environment Variables** 섹션 → 위 11개를 하나씩 추가.

### 5-3. 재배포 (env 적용 위해)

```powershell
npx vercel --prod
```

또는 Vercel 대시보드 → Deployments → 최근 배포 ⋯ → **Redeploy** (Use existing Build Cache 체크 해제).

### 5-4. Telegram에 webhook 등록

브라우저 주소창에:

```
https://api.telegram.org/bot{BOT_TOKEN}/setWebhook?url=https://rotate-meet.vercel.app/api/telegram/webhook&secret_token={WEBHOOK_SECRET}
```

응답:

```json
{ "ok": true, "result": true, "description": "Webhook was set" }
```

### 5-5. 검증

| 확인               | 방법                                                    |
| ------------------ | ------------------------------------------------------- |
| 폼 제출 → DB       | 폼 제출 → Supabase Studio → `signups` row 확인          |
| 폼 제출 → R2       | R2 대시보드 → 버킷에 `face/{uuid}.jpg` 등               |
| 폼 제출 → Telegram | 운영팀 그룹에 사진 2장 + 정보 메시지 도착               |
| [✓ 확인] 버튼      | 메시지에 "✓ 확인됨 by {이름}" 표시 + 확인 버튼 사라짐   |
| `/status`          | 그룹에 입력 → 통계 응답                                 |
| [💬 메모]          | 탭 → 프롬프트 → 답장으로 메모 → 메인 메시지에 메모 누적 |

---

# 🛠 운영 가이드

## 테스트 데이터 정리

같은 전화번호로 재신청은 차단됩니다 (unique 인덱스). 테스트로 같은 번호를 계속 쓰려면:

```sql
-- 특정 번호 신청 삭제
delete from public.signups where phone = '010-1234-5678';

-- 모든 테스트 데이터 삭제
truncate public.signups;
```

R2 사진은 별도 — 대시보드에서 face/body/id 폴더 정리.

## 자주 막히는 부분

| 증상                                                                       | 원인 / 해결                                                                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `permission denied for table signups`                                      | service_role에 GRANT 없음 → `grant all on public.signups to service_role;`                                                 |
| `duplicate key value violates unique constraint signups_phone_active_uidx` | 같은 번호 신청 시도 → 정상 동작 (UI에서 모달로 표시됨)                                                                     |
| Telegram에 메시지 안 옴                                                    | (1) `.env`의 `TELEGRAM_CHAT_ID` 음수 부호 확인 (2) 봇이 그룹 멤버인지 확인 (3) 봇 토큰 오타                                |
| Webhook 버튼 눌러도 반응 없음                                              | (1) `setWebhook` 호출했는지 확인 (2) `getWebhookInfo`로 `last_error_message` 확인 (3) Vercel 환경변수 등록 + 재배포 했는지 |
| `/setprivacy` Disabled인데 `getUpdates` 응답 비어있음                      | 봇 추가 후 새 메시지 보내야 함 (이전 메시지는 못 봄)                                                                       |

## Webhook 상태 확인

```
https://api.telegram.org/bot{BOT_TOKEN}/getWebhookInfo
```

`url`, `pending_update_count`, `last_error_date`, `last_error_message` 표시됨.

## 환경변수 변경 후

- 로컬: dev 서버 재시작 (`Ctrl+C` → `npm run dev`)
- Vercel: 환경변수 추가/수정 후 **재배포 필수**

---

## 🌿 브랜치 전략

- ✅ 작업 브랜치: `main`
- ⏸ `dev`: 사용 안 함

모든 작업은 `main`에서 직접 진행 → `git push` 시 Vercel이 자동 재배포.

---

## 📅 진행 상황

- [x] **1. Supabase 프로젝트 + 스키마** — `signups` 테이블 + ENUM + 인덱스 + RLS + GRANT
- [x] **2. Cloudflare R2 버킷** — 공개/비공개 분리 + R2.dev URL + CORS + API 토큰
- [x] **3. Telegram 봇 + 운영팀 그룹** — Chat ID 확보 + 권한 설정
- [x] **4. 환경변수 11개 정리** — `.env.production` + `.env.example`
- [x] **5. `/api/submit` 라우트** — multipart 검증 + R2 병렬 업로드 + DB insert + Telegram 3-메시지 전송
- [x] **6. `/api/telegram/webhook` 라우트** — verify/reject/delete_id/memo 콜백 + /status, /list, /help 명령어 + ForceReply 메모 플로우
- [x] **7. `FormFlow.tsx` 제출 로직 + UX** — multipart 변환, 로딩 오버레이, 흔들림 버그 수정, 전화번호 중복 모달
- [x] **8. WheelPicker 기본값 자동 적용** — 탭만으로도 175cm/83kg 커밋
- [x] **9. Vercel 배포 + setWebhook 등록** — 환경변수 등록 + production 재배포 + Telegram 웹훅 URL 등록 (진행 중)

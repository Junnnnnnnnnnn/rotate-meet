# 💕 rotate-meet

> Next.js 기반 웹 프로젝트

---

## 🛠 기술 스택

| 항목     | 버전          |
| -------- | ------------- |
| Node.js  | 20 이상 권장  |
| Next.js  | ^16.2.4       |
| React    | ^19.2.5       |

<br>

## 🚀 시작하기

### 1. 설치

```bash
npm install
```

### 2. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 접속 👉 [http://localhost:3000](http://localhost:3000)

<br>

## 📜 스크립트

| 명령어            | 설명                    |
| ----------------- | ----------------------- |
| `npm run dev`     | 개발 서버 실행          |
| `npm run build`   | 프로덕션 빌드           |
| `npm run start`   | 빌드 결과 실행          |
| `npm run lint`    | 린트 검사               |

<br>

## 🌿 브랜치 전략

- ✅ **현재 작업 브랜치**: `main`
- ⏸ **`dev` 브랜치**: 존재하지만 아직 사용하지 않음

> 모든 작업은 `main` 브랜치에서 직접 진행합니다.

<br>

---

# 🗄 백엔드 통합 계획

참가 신청을 받기 위한 백엔드 인프라 구성입니다. **모두 무료 티어**로 운영합니다.

## 🧩 사용 서비스

| 서비스 | 용도 | 무료 한도 |
|---|---|---|
| **Supabase** | 신청 데이터 저장 (PostgreSQL) | DB 500MB · 스토리지 1GB · 월 5만 MAU · 무제한 API |
| **Cloudflare R2** | 사진 저장 (얼굴/전신/신분증) | 스토리지 10GB · 쓰기 100만/월 · 읽기 1000만/월 · **외부 송신(egress) 0원** |
| **Telegram Bot API** | 운영팀 알림 + 액션 처리 | 완전 무료 · 무제한 |

<br>

## 🔄 전체 흐름

```
사용자 폼 제출
  └─▶ POST /api/submit
        ├─▶ Cloudflare R2: 사진 3장 업로드 (face / body / id)
        ├─▶ Supabase: signups 테이블에 INSERT
        └─▶ Telegram 그룹: 알림 메시지 + 사진 + 인라인 버튼 전송

운영팀이 Telegram에서 처리
  └─▶ [✓ 확인] / [🗑 신분증 폐기] / [💬 메모] 버튼 탭
        └─▶ Telegram callback → /api/telegram/webhook
              └─▶ R2 / Supabase 업데이트 + 알림 메시지 갱신
```

<br>

## 🔐 사진 처리 정책

| 사진 종류 | 저장 위치 | 접근 방식 | 폐기 |
|---|---|---|---|
| **얼굴 사진** | R2 공개 폴더 (`face/`) | 공개 URL → Telegram에 직접 전송 | 보존 |
| **전신 사진** | R2 공개 폴더 (`body/`) | 공개 URL → Telegram에 직접 전송 | 보존 |
| **신분증 사진** | R2 비공개 폴더 (`id/`) | **Presigned URL** (단명) 링크만 Telegram에 전송 | 운영자가 [🗑 신분증 폐기] 버튼으로 **수동 삭제** |

> 신분증은 Telegram 채팅에 이미지 자체가 들어가지 않습니다. 운영자가 링크를 탭해 브라우저로 확인한 뒤, 본인확인 끝나면 [🗑 신분증 폐기] 버튼으로 R2에서 삭제 처리합니다.

<br>

## 🗃 Supabase 스키마

### ENUM 타입

| 타입 | 값 | 의미 |
|---|---|---|
| `participation_t` | `new`, `repeat` | 신규 / 재참가 |
| `prefer_age_t` | `동갑`, `연상`, `연하`, `상관없음` | 선호 이성 나이대 |
| `drink_t` | `아메리카노`, `라떼`, `아이스티`, `탄산수` | 행사장 음료 |
| `channel_t` | `인스타그램`, `친구 추천`, `검색`, `기타` | 알게 된 경로 |
| `signup_status_t` | `pending`, `verified`, `cancelled` | 신청 처리 상태 |

### `signups` 테이블 컬럼

| 컬럼 | 타입 | 의미 |
|---|---|---|
| **시스템 메타** | | |
| `id` | uuid PK | 신청 고유 ID. R2 사진 키 이름에도 사용 (`face/{id}.jpg`) |
| `created_at` | timestamptz | 신청 제출 시각 |
| `updated_at` | timestamptz | 마지막 수정 시각 (트리거 자동 갱신) |
| **Step 1 — 본인 확인** | | |
| `name` | text | 실명 (1~50자) |
| `phone` | text | 연락처 (`010-0000-0000` 형식 강제) |
| `birthdate` | date | 생년월일 |
| **Step 2 — 참가 이력** | | |
| `participation` | participation_t | 신규/재참가 |
| **Step 3 — 신체/성향** | | |
| `height_cm` | smallint | 키 (140~210) |
| `weight_kg` | smallint | 몸무게 (35~130, 외부 비공개) |
| `mbti` | text | MBTI 4글자 |
| **Step 4 — 사진** | | |
| `photo_face_url` | text | 얼굴 사진 R2 공개 URL |
| `photo_body_url` | text | 전신 사진 R2 공개 URL |
| `photo_id_key` | text | 신분증 R2 비공개 키 (폐기 시 null) |
| **Step 5 — 자기소개** | | |
| `job` | text | 직업 |
| `ideal_tags` | text[] | 이상형 태그 (최대 5개) |
| `ideal_type_note` | text | 이상형 자유 서술 |
| `strengths` | text | 본인 장점 (선택) |
| **Step 6 — 취향** | | |
| `prefer_age` | prefer_age_t | 선호 이성 나이대 |
| `drink` | drink_t | 음료 |
| `channel` | channel_t | 알게 된 경로 |
| **Step 7 — 선택 항목** | | |
| `insta` | text | 인스타 ID |
| `companion` | text | 동반 참석자 정보 |
| **Step 8 — 동의** | | |
| `refund_agreed` | boolean | 환불 규정 동의 (true 강제) |
| **운영 — 본인확인** | | |
| `status` | signup_status_t | 처리 상태 (기본 `pending`) |
| `verified_at` | timestamptz | [✓ 확인] 누른 시각 |
| `verified_by_id` | bigint | 확인 처리한 운영자 Telegram user_id |
| `verified_by_name` | text | 운영자 표시 이름 |
| **운영 — 신분증 폐기** | | |
| `photo_id_deleted_at` | timestamptz | 폐기 시각 |
| `photo_id_deleted_by_id` | bigint | 폐기 처리한 운영자 Telegram user_id |
| `photo_id_deleted_by` | text | 운영자 표시 이름 |
| **운영 — 메모** | | |
| `admin_memos` | jsonb | 메모 목록 (append-only). 각 항목 `{text, author_id, author_name, created_at}` |
| **Telegram 연동** | | |
| `telegram_chat_id` | bigint | 알림 보낸 그룹 채팅 ID |
| `telegram_notify_msg_id` | bigint | 인라인 버튼 달린 메인 메시지 ID |
| `telegram_photo_msg_ids` | bigint[] | face/body 사진 메시지 ID 배열 |
| **부가 정보** | | |
| `metadata` | jsonb | 디버깅·분석용 (`hero_variant`, `user_agent`, `referrer` 등) |

### 인덱스

| 인덱스 | 의미 |
|---|---|
| `signups_created_at_idx` | 어드민 "최신순" 정렬 가속 |
| `signups_status_idx` | "pending만 보기" 필터 가속 |
| `signups_phone_active_uidx` | 활성 신청 한정 전화번호 unique (중복 신청 차단) |
| `signups_photo_id_pending_idx` | 신분증 미폐기 건 부분 인덱스 (정기 점검용) |

### 보안

- **RLS 활성화 + 정책 0개** → `anon`/`authenticated` 모두 차단
- **`service_role` 키만** Next.js 서버 라우트(`/api/submit`, `/api/telegram/webhook`)에서 사용
- service_role 키는 절대 클라이언트 번들에 포함하지 않음

<br>

## 💬 Telegram 운영 워크플로우

신청 1건당 봇이 운영팀 그룹에 다음 메시지를 전송:

1. **얼굴 사진** (캡션 없음)
2. **전신 사진** (캡션 없음)
3. **메인 알림 메시지** — 신청 정보 텍스트 + 신분증 presigned URL 링크 + 인라인 버튼:
   - `[✓ 확인]` — 본인확인 완료, `status` → `verified`
   - `[🗑 신분증 폐기]` — R2에서 신분증 삭제, `photo_id_*` 컬럼 갱신
   - `[💬 메모]` — ForceReply 프롬프트 → 운영자 답장 → `admin_memos`에 append

버튼 액션 후 메인 알림 메시지가 자동으로 **edit** 되어 처리 결과(누가 언제 처리했는지, 메모 내역 등)가 한 메시지에 누적됩니다.

<br>

## 🔑 환경 변수 (`.env.local`)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

# Cloudflare R2
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_R2_ACCESS_KEY_ID=...
CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
CLOUDFLARE_R2_BUCKET=rotate-meet-photos
R2_PUBLIC_BASE_URL=https://...

# Telegram
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
TELEGRAM_WEBHOOK_SECRET=...
```

<br>

## 📅 진행 단계

- [x] **1. Supabase 프로젝트 + 스키마** — 생성 완료
- [ ] **2. Cloudflare R2 버킷 생성** — `face/` `body/` 공개, `id/` 비공개
- [ ] **3. Telegram 봇 생성** — BotFather에서 봇 생성 + 운영팀 그룹에 추가 + chat_id 확보
- [ ] **4. `.env.local` 채우기**
- [ ] **5. `/api/submit` 라우트 구현** — 사진 업로드 + DB insert + Telegram 알림
- [ ] **6. `/api/telegram/webhook` 라우트 구현** — 버튼 콜백 + 메모 ForceReply 처리
- [ ] **7. `FormFlow.tsx` 제출 로직 연결** — base64 → multipart → API 호출 + 로딩/에러 UI

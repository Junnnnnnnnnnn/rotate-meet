"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentType,
} from "react";

export type FormData = {
  eventDate: string;
  name: string;
  phone: string;
  birthdate: string;
  gender: "" | "male" | "female";
  height: string | number;
  weight: string | number;
  mbti: string;
  photoFace: string | null;
  photoBody: string | null;
  photoIdCard: string | null;
  photoEmployment: string | null;
  job: string;
  idealType: string;
  preferAge: string;
  drink: string;
  channel: string;
  companion: string;
  privacyAgreed: boolean;
  refundAgreed: boolean;
  idealTagsArr?: string[];
  idealTypeNote?: string;
};

export type FormErrors = Partial<Record<keyof FormData, string>>;

export type StepProps = {
  data: FormData;
  update: (patch: Partial<FormData>) => void;
  errors: FormErrors;
  shakeKey: number;
};

type StepHeaderProps = {
  title: string;
  helper?: string;
};

export function StepHeader({ title, helper }: StepHeaderProps) {
  return (
    <>
      <h2 className="step-title">{title}</h2>
      {helper && <p className="step-helper">{helper}</p>}
    </>
  );
}

export function ErrText({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <div className="err-text">{msg}</div>;
}

type ShakeWrapProps = {
  shakeKey: number;
  children: ReactNode;
};

export function ShakeWrap({ shakeKey, children }: ShakeWrapProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const prev = useRef(shakeKey);
  useEffect(() => {
    if (shakeKey !== prev.current && ref.current) {
      const el = ref.current;
      el.classList.remove("shaking");
      void el.offsetWidth;
      el.classList.add("shaking");
    }
    prev.current = shakeKey;
  }, [shakeKey]);
  return (
    <div className="shake-wrap" ref={ref}>
      {children}
    </div>
  );
}

type ApiSession = {
  id: string;
  dateLabel: string;
  dowLabel: string;
  venue: string;
  time: string;
};

function Step1Date({ data, update, errors }: StepProps) {
  // Sessions are DB-driven (managed via the Telegram /date command), fetched
  // from /api/sessions. null = still loading.
  const [sessions, setSessions] = useState<ApiSession[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoadError(false);
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((j: { ok: boolean; sessions?: ApiSession[] }) => {
        if (!alive) return;
        if (j.ok && j.sessions) setSessions(j.sessions);
        else setLoadError(true);
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <StepHeader
        title="참여 날짜를 선택해주세요"
        helper="새 세션이 열리면 이 목록에 추가돼요."
      />
      {sessions === null && !loadError && (
        <p className="step-helper">목록을 불러오는 중...</p>
      )}
      {loadError && (
        <ErrText msg="목록을 불러오지 못했어요. 잠시 후 새로고침 해주세요." />
      )}
      {sessions !== null && !loadError && sessions.length === 0 && (
        <p className="step-helper">현재 열린 세션이 없어요. 운영팀에 문의해주세요.</p>
      )}
      {sessions !== null && sessions.length > 0 && (
        <div className="radio-cards">
          {sessions.map((s) => (
            <label
              key={s.id}
              className={`radio-card radio-card--date ${data.eventDate === s.id ? "selected" : ""}`}
              onClick={() => update({ eventDate: s.id })}
            >
              <span className="ring" />
              <div className="radio-card-body date-body">
                <div className="date-line-1">
                  {s.dateLabel}
                  <span className="date-dow">({s.dowLabel})</span>
                </div>
                <div className="date-line-2">
                  {s.venue} · {s.time}
                </div>
              </div>
            </label>
          ))}
        </div>
      )}
      <ErrText msg={errors.eventDate} />
    </>
  );
}

function Step2Identity({ data, update, errors }: StepProps) {
  const onPhone = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 11);
    let f = digits;
    if (digits.length > 3 && digits.length <= 7)
      f = digits.slice(0, 3) + "-" + digits.slice(3);
    else if (digits.length > 7)
      f = digits.slice(0, 3) + "-" + digits.slice(3, 7) + "-" + digits.slice(7);
    update({ phone: f });
  };
  const onBirth = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 8);
    let f = digits;
    if (digits.length > 4 && digits.length <= 6)
      f = digits.slice(0, 4) + "-" + digits.slice(4);
    else if (digits.length > 6)
      f = digits.slice(0, 4) + "-" + digits.slice(4, 6) + "-" + digits.slice(6);
    update({ birthdate: f });
  };
  return (
    <>
      <StepHeader
        title="먼저, 어떻게 불러드릴까요?"
        helper="실명을 입력해주세요. 매칭 시 사용돼요."
      />
      <div className="field">
        <label className="field-label">
          이름<span className="req">*</span>
        </label>
        <input
          className={`text-input ${errors.name ? "err" : ""}`}
          value={data.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="홍길동"
        />
        <ErrText msg={errors.name} />
      </div>
      <div className="field">
        <label className="field-label">
          연락처<span className="req">*</span>
        </label>
        <input
          className={`text-input ${errors.phone ? "err" : ""}`}
          value={data.phone}
          onChange={(e) => onPhone(e.target.value)}
          placeholder="010-0000-0000"
          inputMode="tel"
        />
        <ErrText msg={errors.phone} />
      </div>
      <div className="field">
        <label className="field-label">
          생년월일<span className="req">*</span>
        </label>
        <input
          className={`text-input ${errors.birthdate ? "err" : ""}`}
          value={data.birthdate}
          onChange={(e) => onBirth(e.target.value)}
          placeholder="YYYY-MM-DD"
          inputMode="numeric"
        />
        <ErrText msg={errors.birthdate} />
      </div>
      <div className="field">
        <label className="field-label">
          직업<span className="req">*</span>
        </label>
        <input
          className={`text-input ${errors.job ? "err" : ""}`}
          value={data.job}
          onChange={(e) => update({ job: e.target.value })}
          placeholder="예) 마케터 / 직장인 / 교사"
        />
        <ErrText msg={errors.job} />
      </div>
    </>
  );
}

const GENDER_OPTIONS = [
  { v: "male", t: "남자", price: "40,000원" },
  { v: "female", t: "여자", price: "30,000원" },
] as const;

function Step3Gender({ data, update, errors }: StepProps) {
  return (
    <>
      <StepHeader title="성별을 선택해주세요" />
      <div className="radio-cards">
        {GENDER_OPTIONS.map((o) => (
          <label
            key={o.v}
            className={`radio-card radio-card--price ${data.gender === o.v ? "selected" : ""}`}
            onClick={() => update({ gender: o.v })}
          >
            <span className="ring" />
            <div className="radio-card-body">
              <div className="radio-main">{o.t}</div>
              <div className="radio-sub">참가비</div>
            </div>
            <div className="radio-card-aside">
              <span className="price-pill">{o.price}</span>
            </div>
          </label>
        ))}
      </div>
      <div className="price-note">
        <div className="price-note-title">🎉 <strong>특별이벤트</strong></div>
        야구 관련 소지품 또는 유니폼 착용 시 5,000원 페이백!
      </div>
      <ErrText msg={errors.gender} />
    </>
  );
}

const MBTI_LIST = [
  { code: "ISTJ", desc: "청렴결백한\n논리주의자" },
  { code: "ISFJ", desc: "용감한 수호자" },
  { code: "INFJ", desc: "선의의 옹호자" },
  { code: "INTJ", desc: "용의주도한 전략가" },
  { code: "ISTP", desc: "만능 재주꾼" },
  { code: "ISFP", desc: "호기심 많은 예술가" },
  { code: "INFP", desc: "열정적인 중재자" },
  { code: "INTP", desc: "논리적인 사색가" },
  { code: "ESTP", desc: "모험을 즐기는\n사업가" },
  { code: "ESFP", desc: "자유로운 영혼" },
  { code: "ENFP", desc: "재기발랄한 활동가" },
  { code: "ENTP", desc: "뜨거운 논쟁가" },
  { code: "ESTJ", desc: "엄격한 관리자" },
  { code: "ESFJ", desc: "사교적인 외교관" },
  { code: "ENFJ", desc: "정의로운\n사회운동가" },
  { code: "ENTJ", desc: "대담한 통솔자" },
];

function mbtiColor(code: string): string {
  if (code[1] === "N" && code[2] === "T") return "#1F1A1A";
  if (code[1] === "N" && code[2] === "F") return "#FF6B5B";
  if (code[1] === "S" && code[3] === "J") return "#4FB286";
  return "#E8A93C";
}

function Step4Body({ data, update, errors }: StepProps) {
  return (
    <>
      <StepHeader
        title="키와 몸무게를 알려주세요"
        helper="매칭 안내에만 활용되며 외부 공개되지 않아요."
      />

      <div className="field-grid-2">
        <WheelPicker
          label="키 (cm)"
          value={data.height}
          min={140}
          max={210}
          onChange={(v) => update({ height: v })}
          err={errors.height}
        />
        <WheelPicker
          label="몸무게 (kg)"
          value={data.weight}
          min={35}
          max={130}
          onChange={(v) => update({ weight: v })}
          err={errors.weight}
        />
      </div>

      <div className="field" style={{ marginTop: "20px" }}>
        <label className="field-label">
          MBTI<span className="req">*</span>
        </label>
        <div className="mbti-grid">
          {MBTI_LIST.map((m) => (
            <button
              key={m.code}
              type="button"
              className={`mbti-card ${data.mbti === m.code ? "selected" : ""}`}
              style={
                data.mbti === m.code ? { borderColor: mbtiColor(m.code) } : {}
              }
              onClick={() => update({ mbti: m.code })}
            >
              <div className="mbti-code" style={{ color: mbtiColor(m.code) }}>
                {m.code}
              </div>
              <div className="mbti-desc">{m.desc}</div>
            </button>
          ))}
        </div>
        <ErrText msg={errors.mbti} />
      </div>
    </>
  );
}

type WheelPickerProps = {
  label: string;
  value: string | number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  err?: string;
};

function WheelPicker({
  label,
  value,
  min,
  max,
  onChange,
  err,
}: WheelPickerProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const userInteracted = useRef(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [touched, setTouched] = useState(false);

  const ITEM_H = 40;
  const WINDOW_H = 160;
  const SPACER = (WINDOW_H - ITEM_H) / 2;

  const items: number[] = [];
  for (let i = min; i <= max; i++) items.push(i);

  const hasValue = value !== "" && value !== null && value !== undefined;
  const numVal = typeof value === "number" ? value : parseInt(value, 10);
  const initialIdx = hasValue
    ? Math.max(0, items.indexOf(numVal))
    : Math.floor(items.length / 2);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = initialIdx * ITEM_H;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markInteracted = () => {
    if (userInteracted.current) return;
    userInteracted.current = true;
    setTouched(true);
    if (!hasValue) onChange(items[initialIdx]);
  };

  const handleScroll = () => {
    if (!ref.current) return;
    if (!userInteracted.current) return;
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      if (!ref.current) return;
      const idx = Math.round(ref.current.scrollTop / ITEM_H);
      const v = items[Math.max(0, Math.min(items.length - 1, idx))];
      if (v !== numVal) onChange(v);
    }, 80);
  };

  const cur = hasValue ? numVal : touched ? items[initialIdx] : null;
  const showPlaceholder = !hasValue && !touched;

  return (
    <div
      className={`wheel ${showPlaceholder ? "wheel--unset" : ""} ${err ? "err" : ""}`}
    >
      <div className="wheel-label">{label}</div>
      <div className="wheel-window">
        <div className="wheel-cursor" />
        {showPlaceholder && (
          <div className="wheel-placeholder">선택해주세요</div>
        )}
        <div
          className="wheel-scroll"
          ref={ref}
          onScroll={handleScroll}
          onTouchStart={markInteracted}
          onMouseDown={markInteracted}
          onWheel={markInteracted}
          onKeyDown={markInteracted}
          tabIndex={0}
        >
          <div style={{ height: SPACER }} />
          {items.map((n) => (
            <div
              key={n}
              className={`wheel-item ${n === cur ? "active" : ""}`}
              style={{ height: ITEM_H, lineHeight: ITEM_H + "px" }}
            >
              {n}
            </div>
          ))}
          <div style={{ height: SPACER }} />
        </div>
      </div>
    </div>
  );
}

type PhotoKey = "photoFace" | "photoBody" | "photoIdCard" | "photoEmployment";

async function compressImageFile(
  file: File,
  maxDim = 1600,
  quality = 0.85,
): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () =>
        reject(
          new Error(
            "이미지를 읽을 수 없어요. JPG/PNG 파일로 다시 시도해주세요.",
          ),
        );
      i.src = url;
    });
    const ratio = Math.min(
      1,
      maxDim / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const w = Math.max(1, Math.round(img.naturalWidth * ratio));
    const h = Math.max(1, Math.round(img.naturalHeight * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 컨텍스트를 만들 수 없어요");
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("이미지 변환 실패"))),
        "image/jpeg",
        quality,
      );
    });
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("이미지 인코딩 실패"));
      reader.readAsDataURL(blob);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Step5Photos({ data, update, errors }: StepProps) {
  const [fileErr, setFileErr] = useState<Partial<Record<PhotoKey, string>>>({});
  const [processing, setProcessing] = useState<
    Partial<Record<PhotoKey, boolean>>
  >({});

  const onFile = async (key: PhotoKey, file: File | undefined) => {
    if (!file) return;
    setFileErr((p) => ({ ...p, [key]: undefined }));
    setProcessing((p) => ({ ...p, [key]: true }));
    try {
      const dataUrl = await compressImageFile(file);
      update({ [key]: dataUrl } as Partial<FormData>);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "이미지 처리 실패";
      setFileErr((p) => ({ ...p, [key]: msg }));
    } finally {
      setProcessing((p) => ({ ...p, [key]: false }));
    }
  };

  return (
    <>
      <StepHeader
        title="사진을 올려주세요"
        helper="얼굴이 잘 보이는 사진과 전신 사진을 각각 한 장씩."
      />

      <div className="upload-grid">
        <PhotoUpload
          label="얼굴 사진"
          hint="필수"
          data={data.photoFace}
          onSelect={(f) => onFile("photoFace", f)}
          onClear={() => {
            update({ photoFace: null });
            setFileErr((p) => ({ ...p, photoFace: undefined }));
          }}
          err={fileErr.photoFace ?? errors.photoFace}
          processing={processing.photoFace}
          iconKey="face"
        />
        <PhotoUpload
          label="전신 사진"
          hint="필수"
          data={data.photoBody}
          onSelect={(f) => onFile("photoBody", f)}
          onClear={() => {
            update({ photoBody: null });
            setFileErr((p) => ({ ...p, photoBody: undefined }));
          }}
          err={fileErr.photoBody ?? errors.photoBody}
          processing={processing.photoBody}
          iconKey="body"
        />
      </div>

      <div className="id-card">
        <IdCardUpload
          data={data.photoIdCard}
          onSelect={(f) => onFile("photoIdCard", f)}
          onClear={() => {
            update({ photoIdCard: null });
            setFileErr((p) => ({ ...p, photoIdCard: undefined }));
          }}
          err={fileErr.photoIdCard ?? errors.photoIdCard}
          processing={processing.photoIdCard}
        />
        <div className="id-card-note">
          <strong>주민번호 뒷자리는 가려서</strong> 촬영해주세요. 본인
          확인용으로만 사용되며 행사 후 즉시 폐기됩니다.
        </div>
      </div>

      <div className="id-card">
        <EmploymentUpload
          data={data.photoEmployment}
          onSelect={(f) => onFile("photoEmployment", f)}
          onClear={() => {
            update({ photoEmployment: null });
            setFileErr((p) => ({ ...p, photoEmployment: undefined }));
          }}
          err={fileErr.photoEmployment ?? errors.photoEmployment}
          processing={processing.photoEmployment}
        />
        <div className="id-card-note">
          인증 가능한 자료라면 무엇이든 괜찮아요 — 예시){" "}
          <strong>
            재직증명서, 명함, 회사명으로 입금된 내역, 사업자등록증
          </strong>{" "}
          등. 행사 후 즉시 폐기됩니다.
        </div>
      </div>
    </>
  );
}

type PhotoUploadProps = {
  label: string;
  hint: string;
  data: string | null;
  onSelect: (file: File | undefined) => void;
  onClear: () => void;
  err?: string;
  processing?: boolean;
  iconKey: "face" | "body";
};

function PhotoUpload({
  label,
  hint,
  data,
  onSelect,
  onClear,
  err,
  processing,
  iconKey,
}: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  if (data) {
    return (
      <div className="upload upload--filled">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={data} alt={label} className="upload-preview" />
        <div className="upload-overlay">
          <div className="upload-overlay-label">{label}</div>
          <button type="button" className="upload-clear" onClick={onClear}>
            변경
          </button>
        </div>
      </div>
    );
  }
  if (processing) {
    return (
      <div className="upload upload--processing">
        <div className="upload-spinner" />
        <div className="upload-label">처리 중...</div>
      </div>
    );
  }
  return (
    <>
      <div
        className={`upload ${err ? "err" : ""}`}
        onClick={() => inputRef.current?.click()}
      >
        <div className="upload-icon">
          {iconKey === "face" && (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FF6B5B"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="13" r="4" />
              <path d="M5 7h2l1.5-2h7L17 7h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
            </svg>
          )}
          {iconKey === "body" && (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FF6B5B"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="7" r="3" />
              <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
            </svg>
          )}
        </div>
        <div className="upload-label">{label}</div>
        <div className="upload-hint">{hint}</div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => onSelect(e.target.files?.[0])}
        />
      </div>
      <ErrText msg={err} />
    </>
  );
}

type IdSlotProps = {
  data: string | null;
  onSelect: (file: File | undefined) => void;
  onClear: () => void;
  err?: string;
  processing?: boolean;
};

function IdCardUpload({
  data,
  onSelect,
  onClear,
  err,
  processing,
}: IdSlotProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  if (data) {
    return (
      <div className="id-upload id-upload--filled">
        <div className="id-image-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data} alt="신분증" className="id-image" />
        </div>
        <div className="id-meta">
          <div>
            <div className="id-status">
              <span className="dot"></span> 본인확인 대기
            </div>
            <div className="id-status-sub">행사 후 즉시 폐기됩니다</div>
          </div>
          <button type="button" className="upload-clear" onClick={onClear}>
            변경
          </button>
        </div>
      </div>
    );
  }
  if (processing) {
    return (
      <div className="id-upload-empty id-upload-empty--processing">
        <div className="upload-spinner" />
        <div>
          <div className="upload-label">처리 중...</div>
        </div>
      </div>
    );
  }
  return (
    <>
      <div
        className={`id-upload-empty ${err ? "err" : ""}`}
        onClick={() => inputRef.current?.click()}
      >
        <div className="upload-icon">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FF6B5B"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>
        <div>
          <div className="upload-label">신분증</div>
          <div className="upload-hint">탭하여 업로드</div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => onSelect(e.target.files?.[0])}
        />
      </div>
      <ErrText msg={err} />
    </>
  );
}

function EmploymentUpload({
  data,
  onSelect,
  onClear,
  err,
  processing,
}: IdSlotProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  if (data) {
    return (
      <div className="id-upload id-upload--filled">
        <div className="id-image-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data} alt="직업 인증" className="id-image" />
        </div>
        <div className="id-meta">
          <div>
            <div className="id-status">
              <span className="dot"></span> 직업 인증 대기
            </div>
            <div className="id-status-sub">행사 후 즉시 폐기됩니다</div>
          </div>
          <button type="button" className="upload-clear" onClick={onClear}>
            변경
          </button>
        </div>
      </div>
    );
  }
  if (processing) {
    return (
      <div className="id-upload-empty id-upload-empty--processing">
        <div className="upload-spinner" />
        <div>
          <div className="upload-label">처리 중...</div>
        </div>
      </div>
    );
  }
  return (
    <>
      <div
        className={`id-upload-empty ${err ? "err" : ""}`}
        onClick={() => inputRef.current?.click()}
      >
        <div className="upload-icon">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FF6B5B"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="13" y2="17" />
          </svg>
        </div>
        <div>
          <div className="upload-label">직업 인증 자료</div>
          <div className="upload-hint">재직증명서 · 명함 · 사업자등록증 등</div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => onSelect(e.target.files?.[0])}
        />
      </div>
      <ErrText msg={err} />
    </>
  );
}

const IDEAL_TAGS = [
  "유머러스",
  "차분함",
  "지적인",
  "다정함",
  "성실함",
  "책임감",
  "감각적",
  "활동적",
  "조용함",
  "긍정적",
  "솔직함",
  "예의바름",
  "센스있는",
  "자상함",
  "리더십",
  "겸손함",
];

function Step6About({ data, update, errors }: StepProps) {
  const [tags, setTags] = useState<string[]>(() => data.idealTagsArr || []);

  const toggleTag = (t: string) => {
    let next: string[];
    if (tags.includes(t)) next = tags.filter((x) => x !== t);
    else if (tags.length >= 5) return;
    else next = [...tags, t];
    setTags(next);
    update({
      idealTagsArr: next,
      idealType:
        next.join(", ") +
        (data.idealTypeNote ? " · " + data.idealTypeNote : ""),
    });
  };

  return (
    <>
      <StepHeader
        title="당신을 조금 더 알려주세요"
        helper="진심을 담아 적어주실수록 좋은 매칭이 가능해요."
      />

      <ChipField
        label="선호하는 이성의 나이대"
        required
        err={errors.preferAge}
        options={["동갑", "연상", "연하", "상관없음"]}
        value={data.preferAge}
        onChange={(v) => update({ preferAge: v })}
      />

      <div className="field">
        <label className="field-label field-label--row">
          <span>
            이상형 <span className="opt">(최대 5개 선택)</span>
          </span>
          <span className="tag-count-inline">{tags.length} / 5</span>
        </label>
        <div className="tag-pool">
          {IDEAL_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              className={`tag-chip ${tags.includes(t) ? "selected" : ""}`}
              onClick={() => toggleTag(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <textarea
          className="text-input"
          rows={3}
          style={{ marginTop: "10px" }}
          value={data.idealTypeNote || ""}
          onChange={(e) => {
            const v = e.target.value;
            update({
              idealTypeNote: v,
              idealType: tags.join(", ") + (v ? " · " + v : ""),
            });
          }}
          placeholder="더 적고 싶은 게 있다면 자유롭게..."
        />
      </div>
    </>
  );
}

type ChipFieldProps = {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  err?: string;
  helper?: string;
};

function ChipField({
  label,
  options,
  value,
  onChange,
  required,
  err,
  helper,
}: ChipFieldProps) {
  return (
    <div className="field">
      <label className="field-label">
        {label}
        {required && <span className="req">*</span>}
      </label>
      {helper && <div className="field-helper">{helper}</div>}
      <div className="chip-group">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className={`chip ${value === o ? "selected" : ""}`}
            onClick={() => onChange(o)}
          >
            {o}
          </button>
        ))}
      </div>
      <ErrText msg={err} />
    </div>
  );
}

function Step7Pref({ data, update, errors }: StepProps) {
  return (
    <>
      <StepHeader
        title="몇 가지만 더요"
        helper="취향에 맞는 자리를 준비할게요."
      />

      <ChipField
        label="마실 음료"
        required
        err={errors.drink}
        helper="음료는 모두 아이스로 제공됩니다"
        options={["아메리카노", "아이스티"]}
        value={data.drink}
        onChange={(v) => update({ drink: v })}
      />

      <ChipField
        label="알게된 경로"
        required
        err={errors.channel}
        options={["인스타그램", "친구 추천", "검색", "기타"]}
        value={data.channel}
        onChange={(v) => update({ channel: v })}
      />

      <div className="field">
        <label className="field-label">
          동반 참석자 <span className="opt">(선택)</span>
        </label>
        <textarea
          className="text-input"
          rows={3}
          value={data.companion}
          onChange={(e) => update({ companion: e.target.value })}
          placeholder="함께 신청하실 분이 있다면 이름과 연락처"
        />
      </div>

      <div className="gentle-nudge">
        <strong>거의 다 왔어요.</strong> 다음 단계에서 환불 규정만 확인하시면
        끝이에요.
      </div>
    </>
  );
}

function Step8Refund({ data, update, errors }: StepProps) {
  return (
    <>
      <StepHeader
        title="신청 전 두 가지만 확인해주세요"
        helper="아래 내용을 꼭 확인하시고 동의해주세요."
      />

      <div className="agree-section">
        <div className="agree-section-title">1. 개인정보 수집·이용 동의</div>
        <div className="privacy-card">
          <div className="privacy-row">
            <div className="privacy-key">수집 항목</div>
            <div className="privacy-val">
              이름, 연락처, 생년월일, 성별, 키·몸무게, MBTI, 직업, 이상형, 선호
              정보, 동반자 정보, 사진(얼굴·전신·신분증·직업 인증), 알게된 경로
            </div>
          </div>
          <div className="privacy-row">
            <div className="privacy-key">이용 목적</div>
            <div className="privacy-val">
              참가자 매칭, 본인·직업 확인, 행사 운영 안내
            </div>
          </div>
          <div className="privacy-row">
            <div className="privacy-key">보유 기간</div>
            <div className="privacy-val">
              신분증·직업 인증 사진은 <strong>행사 종료 즉시 폐기</strong>, 그
              외 정보는 행사 종료 후 6개월간 보관 후 파기
            </div>
          </div>
          <div className="privacy-row">
            <div className="privacy-key">거부 권리</div>
            <div className="privacy-val">
              동의를 거부하실 수 있으며, 거부 시 참가 신청이 불가합니다.
            </div>
          </div>
        </div>

        <label
          className={`check-row ${data.privacyAgreed ? "checked" : ""} ${errors.privacyAgreed ? "err" : ""}`}
          onClick={() => update({ privacyAgreed: !data.privacyAgreed })}
        >
          <span className="check-box">
            {data.privacyAgreed && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </span>
          <div className="check-text">개인정보 수집·이용에 동의합니다</div>
        </label>
        <ErrText msg={errors.privacyAgreed} />
      </div>

      <div className="agree-section">
        <div className="agree-section-title">2. 환불 규정 동의</div>
        <div className="refund-card">
          <div className="refund-row">
            <span className="refund-when">행사 7일 전까지</span>
            <span className="refund-rate full">전액 환불</span>
          </div>
          <div className="refund-row">
            <span className="refund-when">행사 3-6일 전</span>
            <span className="refund-rate half">50% 환불</span>
          </div>
          <div className="refund-row">
            <span className="refund-when">행사 2일 전 이후</span>
            <span className="refund-rate none">환불 불가</span>
          </div>
          <div className="refund-row">
            <span className="refund-when">본인 확인 실패 시</span>
            <span className="refund-rate none">참가 불가</span>
          </div>
        </div>

        <label
          className={`check-row ${data.refundAgreed ? "checked" : ""} ${errors.refundAgreed ? "err" : ""}`}
          onClick={() => update({ refundAgreed: !data.refundAgreed })}
        >
          <span className="check-box">
            {data.refundAgreed && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </span>
          <div className="check-text">환불 규정을 확인했고, 동의합니다</div>
        </label>
        <ErrText msg={errors.refundAgreed} />
      </div>
    </>
  );
}

export const STEP_COMPONENTS: Record<number, ComponentType<StepProps>> = {
  1: Step1Date,
  2: Step2Identity,
  3: Step3Gender,
  4: Step4Body,
  5: Step5Photos,
  6: Step6About,
  7: Step7Pref,
  8: Step8Refund,
};

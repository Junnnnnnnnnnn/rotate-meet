'use client';

import { useLayoutEffect, useState } from 'react';
import {
  ShakeWrap,
  STEP_COMPONENTS,
  ErrText,
  type FormData,
  type FormErrors,
} from './steps';
import type { HeroVariant } from './Landing';

const TOTAL_STEPS = 8;

const INITIAL_DATA: FormData = {
  eventDate: '',
  name: '', phone: '', birthdate: '',
  gender: '',
  height: '', weight: '', mbti: '',
  photoFace: null, photoBody: null, photoIdCard: null, photoEmployment: null,
  job: '', idealType: '',
  preferAge: '', drink: '', channel: '',
  companion: '',
  privacyAgreed: false,
  refundAgreed: false,
};

type FormFlowProps = {
  onComplete: () => void;
  onExit: () => void;
  heroVariant: HeroVariant;
};

type Direction = 'forward' | 'backward';

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

class SubmitError extends Error {
  code?: string;
  constructor(msg: string, code?: string) {
    super(msg);
    this.code = code;
  }
}

async function submitToServer(data: FormData, heroVariant: HeroVariant): Promise<void> {
  const fd = new globalThis.FormData();
  fd.append('event_session_id', data.eventDate);
  fd.append('name', data.name);
  fd.append('phone', data.phone);
  fd.append('birthdate', data.birthdate);
  fd.append('gender', data.gender);
  fd.append('height', String(data.height));
  fd.append('weight', String(data.weight));
  fd.append('mbti', data.mbti);
  fd.append('job', data.job);
  fd.append('ideal_tags', JSON.stringify(data.idealTagsArr ?? []));
  fd.append('ideal_type_note', data.idealTypeNote ?? '');
  fd.append('prefer_age', data.preferAge);
  fd.append('drink', data.drink);
  fd.append('channel', data.channel);
  fd.append('companion', data.companion);
  fd.append('privacy_agreed', String(data.privacyAgreed));
  fd.append('refund_agreed', String(data.refundAgreed));
  fd.append('hero_variant', heroVariant);

  const photos: Array<['photoFace' | 'photoBody' | 'photoIdCard' | 'photoEmployment', string | null]> = [
    ['photoFace', data.photoFace],
    ['photoBody', data.photoBody],
    ['photoIdCard', data.photoIdCard],
    ['photoEmployment', data.photoEmployment],
  ];
  for (const [key, dataUrl] of photos) {
    if (!dataUrl) throw new SubmitError(`${key} 사진이 누락되었어요`);
    const blob = await dataUrlToBlob(dataUrl);
    fd.append(key, blob, `${key}.jpg`);
  }

  const res = await fetch('/api/submit', { method: 'POST', body: fd });
  const result: { ok: boolean; error?: string; code?: string; id?: string } = await res.json();
  if (!res.ok || !result.ok) {
    throw new SubmitError(result.error ?? '제출 중 오류가 발생했어요', result.code);
  }
}

export default function FormFlow({ onComplete, onExit, heroVariant }: FormFlowProps) {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<Direction>('forward');
  const [data, setData] = useState<FormData>(INITIAL_DATA);
  const [errors, setErrors] = useState<FormErrors>({});
  const [shakeKey, setShakeKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [duplicatePhoneOpen, setDuplicatePhoneOpen] = useState(false);
  const [blockedPhoneOpen, setBlockedPhoneOpen] = useState(false);

  // Reset scroll to the very top whenever the step changes. Runs in a layout
  // effect (before paint) so the previous step's scroll position never flashes,
  // and resets every scroll root because mobile browsers disagree on which one
  // (window / documentElement / body) is the actual scroller.
  useLayoutEffect(() => {
    const toTop = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    toTop();
    // Re-assert after layout settles (e.g. Step 1's async session list, image
    // loads) so a late reflow can't leave the user scrolled down.
    const raf = requestAnimationFrame(toTop);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  const update = (patch: Partial<FormData>) => setData((d) => ({ ...d, ...patch }));

  const validateStep = (s: number): FormErrors => {
    const e: FormErrors = {};
    if (s === 1) {
      if (!data.eventDate) e.eventDate = '참여 날짜를 선택해주세요';
    }
    if (s === 2) {
      if (!data.name.trim()) e.name = '이름을 입력해주세요';
      if (!data.phone.trim()) e.phone = '연락처를 입력해주세요';
      else if (!/^01[016789]-?\d{3,4}-?\d{4}$/.test(data.phone.replace(/\s/g, '')))
        e.phone = '010-0000-0000 형식으로 입력해주세요';
      if (!data.birthdate.trim()) e.birthdate = '생년월일을 입력해주세요';
      if (!data.job.trim()) e.job = '직업을 입력해주세요';
    }
    if (s === 3) {
      if (!data.gender) e.gender = '성별을 선택해주세요';
    }
    if (s === 4) {
      if (!data.height) e.height = '키를 입력해주세요';
      if (!data.weight) e.weight = '몸무게를 입력해주세요';
      if (!data.mbti) e.mbti = 'MBTI를 선택해주세요';
    }
    if (s === 5) {
      if (!data.photoFace) e.photoFace = '얼굴 사진은 필수예요';
      if (!data.photoBody) e.photoBody = '전신 사진은 필수예요';
      if (!data.photoIdCard) e.photoIdCard = '신분증 사진은 필수예요';
      if (!data.photoEmployment) e.photoEmployment = '직업 인증 자료는 필수예요';
    }
    if (s === 6) {
      if (!data.preferAge) e.preferAge = '선택해주세요';
    }
    if (s === 7) {
      if (!data.drink) e.drink = '선택해주세요';
      if (!data.channel) e.channel = '선택해주세요';
    }
    if (s === 8) {
      if (!data.privacyAgreed) e.privacyAgreed = '개인정보 수집·이용 동의가 필요해요';
      if (!data.refundAgreed) e.refundAgreed = '환불 규정 동의가 필요해요';
    }
    return e;
  };

  const handleNext = async () => {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      setShakeKey((k) => k + 1);
      return;
    }
    if (step >= TOTAL_STEPS) {
      if (submitting) return;
      setSubmitting(true);
      setSubmitError(null);
      try {
        await submitToServer(data, heroVariant);
        onComplete();
      } catch (err) {
        if (err instanceof SubmitError && err.code === 'duplicate_phone') {
          setDuplicatePhoneOpen(true);
        } else if (err instanceof SubmitError && err.code === 'phone_blocked') {
          setBlockedPhoneOpen(true);
        } else {
          setSubmitError(err instanceof Error ? err.message : '제출 중 오류가 발생했어요');
          setShakeKey((k) => k + 1);
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }
    setDirection('forward');
    setStep(step + 1);
  };

  const handlePrev = () => {
    if (submitting) return;
    if (step <= 1) {
      onExit();
      return;
    }
    setDirection('backward');
    setErrors({});
    setStep(step - 1);
  };

  const StepEl = STEP_COMPONENTS[step];

  return (
    <div className="form-flow">
      <div className="form-header">
        <div className="header-row">
          <button className="back-btn" onClick={handlePrev} aria-label="back" disabled={submitting}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1F1A1A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div className="step-counter"><strong>{step}</strong> / {TOTAL_STEPS}</div>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
        </div>
      </div>

      <div className="step-viewport" data-screen-label={`Step ${step}`}>
        <div key={step} className={`step-slide step-slide--${direction}`}>
          <ShakeWrap shakeKey={shakeKey}>
            <StepEl data={data} update={update} errors={errors} shakeKey={shakeKey} />
          </ShakeWrap>
        </div>
      </div>

      {submitError && (
        <div style={{ padding: '0 20px 8px' }}>
          <ErrText msg={submitError} />
        </div>
      )}

      <div className="form-footer">
        <button className="btn-prev" onClick={handlePrev} disabled={submitting}>
          {step === 1 ? '취소' : '이전'}
        </button>
        <button className="btn-next" onClick={handleNext} disabled={submitting}>
          {step === TOTAL_STEPS ? '제출하기' : '다음'}
        </button>
      </div>

      {submitting && (
        <div className="submit-overlay" role="status" aria-live="polite">
          <div className="submit-overlay-card">
            <div className="submit-progress-bar" />
            <div className="submit-overlay-text">제출 중...</div>
            <div className="submit-overlay-sub">사진 업로드 중이에요<br />잠시만 기다려주세요</div>
          </div>
        </div>
      )}

      {duplicatePhoneOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF6B5B" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="13" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3 className="modal-title">이미 등록된 연락처예요</h3>
            <p className="modal-message">
              같은 번호로는 한 번만 신청하실 수 있어요.<br />
              전화번호를 확인해주세요.
            </p>
            <button
              type="button"
              className="modal-button"
              onClick={() => {
                setDuplicatePhoneOpen(false);
                setSubmitError(null);
                setErrors({});
                setDirection('backward');
                setStep(2);
              }}
            >
              전화번호 수정하기
            </button>
          </div>
        </div>
      )}

      {blockedPhoneOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF6B5B" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h3 className="modal-title">신청이 제한된 연락처예요</h3>
            <p className="modal-message">
              이전에 거절된 신청이 있어요.<br />
              이 번호로는 다시 신청하실 수 없어요.
            </p>
            <button
              type="button"
              className="modal-button"
              onClick={() => {
                setBlockedPhoneOpen(false);
                setSubmitError(null);
                setErrors({});
                setDirection('backward');
                setStep(2);
              }}
            >
              전화번호 확인하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

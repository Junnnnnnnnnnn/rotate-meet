'use client';

import { useEffect, useState } from 'react';
import {
  ShakeWrap,
  STEP_COMPONENTS,
  type FormData,
  type FormErrors,
} from './steps';

const TOTAL_STEPS = 8;

const INITIAL_DATA: FormData = {
  name: '', phone: '', birthdate: '',
  participation: '',
  height: '', weight: '', mbti: '',
  photoFace: null, photoBody: null, photoId: null,
  job: '', idealType: '', strengths: '',
  preferAge: '', drink: '', channel: '',
  insta: '', companion: '',
  refundAgreed: false,
};

type FormFlowProps = {
  onComplete: () => void;
  onExit: () => void;
};

type Direction = 'forward' | 'backward';

export default function FormFlow({ onComplete, onExit }: FormFlowProps) {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<Direction>('forward');
  const [data, setData] = useState<FormData>(INITIAL_DATA);
  const [errors, setErrors] = useState<FormErrors>({});
  const [shakeKey, setShakeKey] = useState(0);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  const update = (patch: Partial<FormData>) => setData((d) => ({ ...d, ...patch }));

  const validateStep = (s: number): FormErrors => {
    const e: FormErrors = {};
    if (s === 1) {
      if (!data.name.trim()) e.name = '이름을 입력해주세요';
      if (!data.phone.trim()) e.phone = '연락처를 입력해주세요';
      else if (!/^01[016789]-?\d{3,4}-?\d{4}$/.test(data.phone.replace(/\s/g, '')))
        e.phone = '010-0000-0000 형식으로 입력해주세요';
      if (!data.birthdate.trim()) e.birthdate = '생년월일을 입력해주세요';
    }
    if (s === 2) {
      if (!data.participation) e.participation = '선택해주세요';
    }
    if (s === 3) {
      if (!data.height) e.height = '키를 입력해주세요';
      if (!data.weight) e.weight = '몸무게를 입력해주세요';
      if (!data.mbti) e.mbti = 'MBTI를 선택해주세요';
    }
    if (s === 4) {
      if (!data.photoFace) e.photoFace = '얼굴 사진은 필수예요';
      if (!data.photoBody) e.photoBody = '전신 사진은 필수예요';
      if (!data.photoId) e.photoId = '신분증 사진은 필수예요';
    }
    if (s === 5) {
      if (!data.job.trim()) e.job = '직업을 입력해주세요';
    }
    if (s === 6) {
      if (!data.preferAge) e.preferAge = '선택해주세요';
      if (!data.drink) e.drink = '선택해주세요';
      if (!data.channel) e.channel = '선택해주세요';
    }
    if (s === 8) {
      if (!data.refundAgreed) e.refundAgreed = '환불 규정 동의가 필요해요';
    }
    return e;
  };

  const handleNext = () => {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      setShakeKey((k) => k + 1);
      return;
    }
    if (step >= TOTAL_STEPS) {
      onComplete();
      return;
    }
    setDirection('forward');
    setStep(step + 1);
  };

  const handlePrev = () => {
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
          <button className="back-btn" onClick={handlePrev} aria-label="back">
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

      <div className="form-footer">
        <button className="btn-prev" onClick={handlePrev}>
          {step === 1 ? '취소' : '이전'}
        </button>
        <button className="btn-next" onClick={handleNext}>
          {step === TOTAL_STEPS ? '제출하기' : '다음'}
        </button>
      </div>
    </div>
  );
}

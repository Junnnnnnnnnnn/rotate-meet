'use client';

type SuccessProps = {
  onHome: () => void;
};

export default function Success({ onHome }: SuccessProps) {
  return (
    <div className="success-screen" data-screen-label="Success">
      <div className="success-art">
        <div className="ripple r1" />
        <div className="ripple r2" />
        <div className="ripple r3" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/heart.svg" alt="heart" className="success-heart" />
      </div>
      <h2 className="success-title">신청이 완료됐어요</h2>
      <p className="success-sub">
        적어주신 연락처로<br />
        <strong>3일 이내</strong> 안내드릴게요.
      </p>
      <p className="success-thanks">진심을 담아 적어주셔서 감사해요.</p>
      <button className="btn-block btn-block--inline" onClick={onHome}>
        처음으로
      </button>
    </div>
  );
}

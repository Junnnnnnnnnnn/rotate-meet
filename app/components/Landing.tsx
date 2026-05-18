"use client";

export type HeroVariant = "default" | "centered" | "minimal";

type LandingProps = {
  onApply: () => void;
  heroVariant: HeroVariant;
};

type HeroProps = {
  onApply: () => void;
};

export default function Landing({ onApply, heroVariant }: LandingProps) {
  return (
    <div className="landing">
      {heroVariant === "default" && <HeroPoster onApply={onApply} />}
      {heroVariant === "centered" && <HeroCentered onApply={onApply} />}
      {heroVariant === "minimal" && <HeroMinimal onApply={onApply} />}

      <section className="section section--first">
        <div className="eyebrow">FOR WHO</div>
        <h2 className="sec-title">이런 분들을 찾고 있어요</h2>
        <div className="target-list">
          {(
            [
              [
                "01",
                "연애를 하고 싶으신 분",
                "지나가는 인연이 아닌 진짜 인연을 찾아 드립니다.",
              ],
              [
                "02",
                "20대 ~ 30대 사회인이라면 누구나!",
                "솔로인 91~00년생 누구나 환영합니다.",
              ],
              [
                "03",
                "대화가 잘 통하는 인연을 찾는 분",
                "같은 취미를 가진 사람과 깊은 대화를 나눠보세요.",
              ],
            ] as const
          ).map(([n, t, s]) => (
            <div className="target-row" key={n}>
              <span className="target-num">{n}</span>
              <div>
                <div className="target-text">{t}</div>
                <div className="target-sub">{s}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section section--coral">
        <div className="eyebrow">HOW IT WORKS</div>
        <h2 className="sec-title">로테이션이 뭔가요?</h2>
        <div className="how-list">
          {(
            [
              ["1", "한 자리에 모이기", "남녀가 함께 한 카페에 모여요"],
              ["2", "한 사람씩, 10분 대화", "10분이 지나면 자리를 바꿔요"],
              ["3", "모두와 대화 후, 매칭", "마음에 든 사람을 적어 제출"],
            ] as const
          ).map(([n, t, s]) => (
            <div className="how-step" key={n}>
              <div className="step-circle">{n}</div>
              <div>
                <h3 className="how-title">{t}</h3>
                <p className="how-desc">{s}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="cta-section">
        <h2 className="sec-title">
          지금, 진짜 인연을
          <br />
          만나러 오세요
        </h2>
        <p className="cta-sub">신청서 작성 약 5분 · 검토 후 개별 연락</p>
        <button className="btn-block" onClick={onApply}>
          참가 신청하기 <span className="arrow">→</span>
        </button>
      </section>

      <footer className="footer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/wordmark.svg" alt="" />
        <p>© 2026 로테이션 소개팅</p>
        <p>문의 · 환불 규정은 신청서에서 확인하세요</p>
      </footer>
    </div>
  );
}

function HeroPoster(_props: HeroProps) {
  return (
    <section className="hero hero--poster">
      <div className="poster-top">
        <svg
          className="poster-ekg poster-ekg--left"
          viewBox="0 0 200 60"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line
            x1="0"
            y1="30"
            x2="200"
            y2="30"
            stroke="#FF4F3D"
            strokeWidth="1.5"
          />
        </svg>
        <div className="poster-brand">썸개팅</div>
        <svg
          className="poster-ekg poster-ekg--right"
          viewBox="0 0 200 60"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline
            points="0,30 92,30 93.5,24 95,36 96.5,30 96.9,30 98.4,20 99.9,40 101.4,30 104.2,-2 109.2,62 114.2,12 119.2,42 122.7,30 122.9,30 124.4,24 125.9,36 127.4,30 200,30"
            fill="none"
            stroke="#FF4F3D"
            strokeWidth="1.6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="poster-block">
        <h1 className="poster-title">
          <span className="poster-title-coral">로테이션 소개팅</span>
          <span className="poster-title-black">참 가 신 청</span>
        </h1>
        <p className="poster-sub">
          참가를 원하시는 경우 아래 신청서를 작성해주세요
        </p>
      </div>
    </section>
  );
}

function HeroCentered({ onApply }: HeroProps) {
  return (
    <section className="hero hero--centered">
      <div className="badge-pill">제 1회 · 2026.05.23</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="centered-ill"
        src="/assets/couple-cutout.png"
        alt="couple"
      />
      <h1 className="hero-title hero-title--centered">
        91-00년생 솔로,
        <br />
        <span style={{ color: "var(--coral)" }}>결혼 진심파</span> 모집
      </h1>
      <p className="hero-sub">
        진짜 인연을 만나러 오세요.
        <br />
        5분씩 돌아가며, 모두와 대화해요.
      </p>
      <button className="btn-block btn-block--inline" onClick={onApply}>
        참가 신청하기 <span className="arrow">→</span>
      </button>
    </section>
  );
}

function HeroMinimal({ onApply }: HeroProps) {
  return (
    <section className="hero hero--minimal">
      <div className="minimal-eyebrow">제 1회 로테이션 소개팅</div>
      <h1 className="hero-title hero-title--minimal">
        진심으로
        <br />
        만나려는
        <br />
        사람들의
        <br />
        <span style={{ color: "var(--coral)" }}>자리.</span>
      </h1>
      <div className="minimal-meta">
        <div>
          <span className="minimal-key">날짜</span>
          <span>2026.05.23 (토)</span>
        </div>
        <div>
          <span className="minimal-key">장소</span>
          <span>신논현역 인근 카페</span>
        </div>
        <div>
          <span className="minimal-key">대상</span>
          <span>91 ~ 00년생 솔로</span>
        </div>
        <div>
          <span className="minimal-key">참가비</span>
          <span>30,000원 (10% 할인)</span>
        </div>
      </div>
      <button className="btn-block btn-block--inline" onClick={onApply}>
        참가 신청하기 <span className="arrow">→</span>
      </button>
    </section>
  );
}

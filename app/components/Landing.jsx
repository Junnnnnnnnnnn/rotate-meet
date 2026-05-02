'use client';

export default function Landing({ onApply, heroVariant }) {
  return (
    <div className="landing">
      {heroVariant === 'default' && <HeroPoster onApply={onApply} />}
      {heroVariant === 'centered' && <HeroCentered onApply={onApply} />}
      {heroVariant === 'minimal' && <HeroMinimal onApply={onApply} />}

      <section className="section section--first">
        <div className="eyebrow">FOR WHO</div>
        <h2 className="sec-title">이런 분들을<br />찾고 있어요</h2>
        <div className="target-list">
          {[
            ['01', '결혼에 진심인 분', '가벼운 만남이 아닌, 평생 함께할 사람을 찾는 분'],
            ['02', '2030 결혼 적령기', '91~00년생 솔로'],
            ['03', '진짜 인연을 찾고 싶은 분', '여러 사람과 짧지만 밀도 있게 대화하고 싶은 분'],
          ].map(([n, t, s]) => (
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
          {[
            ['1', '한 자리에 모이기', '남녀 동수가 한 카페에 모여요'],
            ['2', '한 사람씩, 5분 대화', '5분이 지나면 자리를 바꿔요'],
            ['3', '모두와 대화 후, 매칭', '마음에 든 사람을 적어 제출'],
          ].map(([n, t, s]) => (
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
        <h2 className="sec-title">지금, 진짜 인연을<br />만나러 오세요</h2>
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

function HeroPoster() {
  return (
    <section className="hero hero--poster">
      <h1 className="hero-title">
        <span className="typed-line l1">제 1회</span>
        <span className="typed-line l2">로테이션 소개팅</span>
        <span className="typed-line l3">참 가 자 모 집</span>
      </h1>

      <div className="date-pill">2026.05.23 (토) 신논현역 인근 카페</div>

      <div className="info-list">
        <div className="info-row"><span className="info-key">모집대상</span>: 솔로인 91년 ~ 00년생</div>
        <div className="info-row"><span className="info-key">참가비</span>: 30,000원 <span style={{ color: 'var(--coral)' }}>(첫 개최기념 10% 특별할인)</span></div>
        <div className="info-row"><span className="info-key">참가방법</span>: 아래 신청서 작성</div>
      </div>

      <div className="ill-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/couple-cutout.png" alt="couple" />
      </div>
    </section>
  );
}

function HeroCentered({ onApply }) {
  return (
    <section className="hero hero--centered">
      <div className="badge-pill">제 1회 · 2026.05.23</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="centered-ill" src="/assets/couple-cutout.png" alt="couple" />
      <h1 className="hero-title hero-title--centered">
        91-00년생 솔로,<br />
        <span style={{ color: 'var(--coral)' }}>결혼 진심파</span> 모집
      </h1>
      <p className="hero-sub">
        진짜 인연을 만나러 오세요.<br />
        5분씩 돌아가며, 모두와 대화해요.
      </p>
      <button className="btn-block btn-block--inline" onClick={onApply}>
        참가 신청하기 <span className="arrow">→</span>
      </button>
    </section>
  );
}

function HeroMinimal({ onApply }) {
  return (
    <section className="hero hero--minimal">
      <div className="minimal-eyebrow">제 1회 로테이션 소개팅</div>
      <h1 className="hero-title hero-title--minimal">
        진심으로<br />
        만나려는<br />
        사람들의<br />
        <span style={{ color: 'var(--coral)' }}>자리.</span>
      </h1>
      <div className="minimal-meta">
        <div><span className="minimal-key">날짜</span><span>2026.05.23 (토)</span></div>
        <div><span className="minimal-key">장소</span><span>신논현역 인근 카페</span></div>
        <div><span className="minimal-key">대상</span><span>91 ~ 00년생 솔로</span></div>
        <div><span className="minimal-key">참가비</span><span>30,000원 (10% 할인)</span></div>
      </div>
      <button className="btn-block btn-block--inline" onClick={onApply}>
        참가 신청하기 <span className="arrow">→</span>
      </button>
    </section>
  );
}

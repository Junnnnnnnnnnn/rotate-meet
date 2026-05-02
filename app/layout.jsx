import './globals.css';

export const metadata = {
  title: '로테이션 소개팅',
  description: '제 1회 로테이션 소개팅 — 91~00년생 솔로 참가자 모집',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

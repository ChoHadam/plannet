import type { Metadata, Viewport } from "next";
import { BRAND_COLORS } from "@/lib/constants";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Plannet | 나만의 플래너",
  description: "다양한 템플릿으로 체계적인 목표를 설정하고 관리하세요",
  applicationName: "Plannet",
  // 홈 화면 앱(manifest.ts). 상태 표시줄은 기본(내용과 겹치지 않음). 아이콘은 apple-icon.tsx가 링크된다.
  appleWebApp: { capable: true, title: "Plannet", statusBarStyle: "default" },
};

// 확대는 제한하지 않는다(maximum-scale·user-scalable 없음). 노치 안쪽 여백은 globals.css의 safe-area padding이 맡는다.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: BRAND_COLORS.background,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* 인증 설정은 빌드 시점이 아니라 브라우저에서 요청 시점에 받아온다 */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

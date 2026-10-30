import type { Metadata } from "next";
import { ServiceWorkerRegistration } from "../components/service-worker-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "个人练习室 · 考试练习",
  description: "随时练习、回顾错题，联网同步你的学习进度。",
  applicationName: "个人练习室",
  icons: {
    icon: "/icons/app.svg",
    shortcut: "/icons/app-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
        <link rel="apple-touch-icon" href="/icons/app-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="个人练习室" />
      </head>
      <body><ServiceWorkerRegistration />{children}</body>
    </html>
  );
}

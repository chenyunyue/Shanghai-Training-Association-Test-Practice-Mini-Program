import type { Metadata } from "next";
import { ServiceWorkerRegistration } from "../components/service-worker-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "个人练习室 · 考试练习",
  description: "随时练习、回顾错题，联网同步你的学习进度。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased"><ServiceWorkerRegistration />{children}</body>
    </html>
  );
}

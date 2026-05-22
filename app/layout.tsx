import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/contexts/AuthContext";
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
  title: "AI Cartoon Avatar - Transform Your Photos into Stunning Art",
  description: "Upload your photo and choose a style to generate unique cartoon avatars using AI. Free credits available!",
  keywords: ["AI", "cartoon", "avatar", "generator", "anime", "photo to cartoon"],
  openGraph: {
    title: "AI Cartoon Avatar",
    description: "Transform your photos into stunning cartoon art with AI",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* 全局认证Provider */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

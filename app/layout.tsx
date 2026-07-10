import type { Metadata } from "next";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Magic Cartoon Avatar - Transform Your Photos into Stunning Art",
  description: "Upload your photo and choose a style to generate unique cartoon avatars using AI. Free credits available!",
  keywords: ["AI", "cartoon", "avatar", "generator", "anime", "photo to cartoon"],
  openGraph: {
    title: "Magic Cartoon Avatar",
    description: "Transform your photos into stunning cartoon art with AI",
    type: "website",
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {/* Theme provider - initializes theme from localStorage on every page load */}
        <ThemeProvider>
          {/* 全局认证Provider */}
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

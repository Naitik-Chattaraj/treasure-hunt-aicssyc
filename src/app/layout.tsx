import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AICSSYC 2026 | Campus Treasure Hunt",
  description: "Official Campus Treasure Hunt Competition Gateway for AICSSYC 2026",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F2E8" },
    { media: "(prefers-color-scheme: dark)", color: "#131412" },
  ],
  viewportFit: "cover",
};

// Applies the saved (or system) theme before first paint so pages never flash the wrong theme.
// Keep the storage key in sync with ThemeToggle.
const themeInitScript = `(function(){try{var t=localStorage.getItem('aicssyc_theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}var c=document.documentElement.classList;c.remove('light','dark');c.add(t)}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

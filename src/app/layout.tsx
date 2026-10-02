import type { Metadata, Viewport } from "next";
import { Inter, Lilita_One } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const lilitaOne = Lilita_One({
  variable: "--font-lilita",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AICSSYC 2026 | Campus Treasure Hunt",
  description: "Official Campus Treasure Hunt Competition Gateway for AICSSYC 2026",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F3D6A8" },
    { media: "(prefers-color-scheme: dark)", color: "#1A130C" },
  ],
  viewportFit: "cover",
};

// Applies the saved theme (light by default) before first paint so pages never flash the wrong theme.
// Keep the storage key in sync with ThemeToggle.
const themeInitScript = `(function(){try{var t=localStorage.getItem('aicssyc_theme');if(t!=='dark'){t='light'}var c=document.documentElement.classList;c.remove('light','dark');c.add(t)}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${lilitaOne.variable} light h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Text to Speech - AI Voice Generator",
  description: "Convert text to natural-sounding speech using AI voices. Free, no sign-up required.",
  keywords: ["text to speech", "TTS", "AI voice", "voice generator", "speech synthesis"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

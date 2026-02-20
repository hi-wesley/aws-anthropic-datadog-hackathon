import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wow an AI Financial Agent I've never seen that before",
  description: "Voice + text credit health coaching with Bedrock + Datadog"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

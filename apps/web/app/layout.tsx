import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Credit Coach",
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

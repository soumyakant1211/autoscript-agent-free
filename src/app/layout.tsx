import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MeProvider } from "@/components/MeProvider";
import { Header } from "@/components/Header";

const siteUrl = process.env.BETTER_AUTH_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000";
const description = "Describe your app and get a complete, runnable test automation framework — 54 stacks, every file syntax-checked.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "AutoScript Agent", template: "%s · AutoScript Agent" },
  description,
  openGraph: { type: "website", siteName: "AutoScript Agent", title: "AutoScript Agent", description, url: "/" },
  twitter: { card: "summary_large_image", title: "AutoScript Agent", description },
};
export const viewport: Viewport = { themeColor: "#0b0f17" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex min-h-full flex-col antialiased">
        <MeProvider>
          <Header />
          <main className="flex flex-1 flex-col">{children}</main>
        </MeProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MeProvider } from "@/components/MeProvider";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "AutoScript Agent",
  description: "AI agent that generates complete, runnable test automation frameworks for 54 tech stacks.",
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

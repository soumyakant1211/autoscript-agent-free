import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** App icon (browser tab), drawn in code: teal rounded square with a </> mark. */
export function AppMark({ px }: { px: number }) {
  return (
    <div style={{ width: px, height: px, display: "flex", alignItems: "center", justifyContent: "center", background: "#22d3a6", borderRadius: px * 0.22 }}>
      <svg width={px * 0.72} height={px * 0.72} viewBox="0 0 64 64">
        <path d="M24 20 12 32l12 12M40 20l12 12-12 12" fill="none" stroke="#04131a" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M35 17 29 47" stroke="#04131a" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export default function Icon() {
  return new ImageResponse(<AppMark px={64} />, size);
}

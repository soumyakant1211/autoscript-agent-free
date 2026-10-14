"use client";
import { useEffect, useState } from "react";

type Line = { k: "cmd" | "meta" | "file" | "warn" | "fix" | "pass"; label?: string; text: string };

const SCRIPT: Line[] = [
  { k: "cmd", text: "Login to saucedemo with a valid and a locked-out user, add a backpack to the cart, check out" },
  { k: "meta", label: "stack", text: "TypeScript + Playwright Test" },
  { k: "meta", label: "plan", text: "9 files: page objects, fixtures, test data, CI" },
  { k: "file", label: "write", text: "package.json" },
  { k: "file", text: "playwright.config.ts" },
  { k: "file", text: "pages/LoginPage.ts" },
  { k: "file", text: "pages/InventoryPage.ts" },
  { k: "file", text: "pages/CheckoutPage.ts" },
  { k: "file", text: "tests/login.spec.ts" },
  { k: "file", text: "tests/checkout.spec.ts" },
  { k: "file", text: ".github/workflows/e2e.yml" },
  { k: "file", text: "README.md" },
  { k: "warn", label: "check", text: "tests/checkout.spec.ts line 18: missing \")\"" },
  { k: "fix", label: "fix", text: "tests/checkout.spec.ts rewritten" },
  { k: "pass", text: "9 of 9 files pass syntax checks" },
];

export function HeroRun() {
  const [shown, setShown] = useState(0);

  // Animation runs only in the browser after hydration; reduced-motion users get the finished run immediately.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const t = setTimeout(() => setShown(SCRIPT.length), 0);
      return () => clearTimeout(t);
    }
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      i++; setShown(i);
      if (i < SCRIPT.length) timer = setTimeout(tick, i < 3 ? 650 : SCRIPT[i]?.k === "file" ? 170 : 520);
      else timer = setTimeout(() => { i = 0; setShown(0); timer = setTimeout(tick, 900); }, 6000);
    };
    timer = setTimeout(tick, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="lp-run" aria-label="Example: AutoScript Agent generating a Playwright project" role="img">
      <div className="lp-run-bar"><span /><span /><span /><em>autoscript run</em></div>
      <ol className="lp-run-body">
        {SCRIPT.slice(0, shown).map((l, i) => (
          <li key={i} className={`lp-l lp-l-${l.k}`}>
            {l.k === "cmd" ? (<><b className="lp-prompt">describe</b><span className="lp-cmd">“{l.text}”</span></>) : (
              <>
                <b className="lp-tag">{l.label ?? ""}</b>
                <span>
                  {l.k === "file" && <i className="lp-ok">✓</i>}
                  {l.k === "warn" && <i className="lp-bad">✕</i>}
                  {l.k === "fix" && <i className="lp-ok">↻</i>}
                  {l.k === "pass" && <i className="lp-ok">●</i>}
                  {l.text}
                </span>
              </>
            )}
          </li>
        ))}
        {shown < SCRIPT.length && <li className="lp-l"><b className="lp-tag" /><span className="lp-caret" /></li>}
      </ol>
    </div>
  );
}

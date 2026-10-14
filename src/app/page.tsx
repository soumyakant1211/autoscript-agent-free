import Link from "next/link";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./landing.css";
import { STACKS } from "@/lib/prompt";
import { HeroRun } from "@/components/landing/HeroRun";
import { LandingCta, LandingNavAuth } from "@/components/landing/LandingCta";

const TOTAL = STACKS.reduce((n, g) => n + g.items.length, 0);

const STEPS = [
  { name: "Plan", text: "The agent designs the file layout first, including which page objects, fixtures and helpers each test will use." },
  { name: "Write", text: "Files are written in parallel batches against that plan, so large projects don't get cut off halfway." },
  { name: "Check", text: "Every Java, Python, C#, TypeScript, JavaScript, JSON, YAML, XML and Gherkin file is parsed for syntax errors." },
  { name: "Fix", text: "Anything broken goes back to the agent with the exact line, and comes back corrected before you see it." },
];

const PLANS = [
  { who: "Guest", how: "No sign-in", gen: "2 a month", extra: "3 follow-up changes per project" },
  { who: "Signed in", how: "Google, Microsoft, GitHub or email link", gen: "5 a month", extra: "5 follow-up changes per project" },
  { who: "Member", how: "Upgraded by an admin", gen: "50 a month", extra: "Saved project history" },
  { who: "Demo accounts", how: "Shown on the sign-in page", gen: "5 a day", extra: "Private copy per visitor, deleted after 24 hours" },
];

const BUILT_WITH = ["Next.js 16", "React 19", "TypeScript", "Better Auth", "PostgreSQL", "Drizzle ORM", "Gemini", "tree-sitter", "Playwright", "Vitest"];

export default function Landing() {
  return (
    <div className="lp">
      <nav className="lp-nav" aria-label="Main">
        <Link href="/" className="lp-brand"><span className="lp-logo" aria-hidden="true">⟨/⟩</span>AutoScript Agent</Link>
        <div className="lp-nav-right"><a href="#stacks" className="lp-nav-link lp-hide-sm">Stacks</a><a href="#plans" className="lp-nav-link lp-hide-sm">Plans</a><LandingNavAuth /></div>
      </nav>

      <header className="lp-hero">
        <div className="lp-hero-copy">
          <h1>Describe the app. Get a test framework that runs.</h1>
          <p className="lp-lede">
            AutoScript Agent plans the project, writes every file, checks the syntax and fixes what&apos;s broken.
            Selenium, Playwright, Cypress, Appium, RestAssured, Karate, k6 and {TOTAL - 7} more stacks.
          </p>
          <LandingCta />
          <p className="lp-fine">No card, no install. Download the project as a ZIP when it&apos;s ready.</p>
        </div>
        <HeroRun />
      </header>

      <section className="lp-section" aria-labelledby="how">
        <h2 id="how">What happens when you press Generate</h2>
        <ol className="lp-steps">
          {STEPS.map((s, i) => (
            <li key={s.name}><span className="lp-step-n">{i + 1}</span><h3>{s.name}</h3><p>{s.text}</p></li>
          ))}
        </ol>
        <p className="lp-after">Then keep talking to it: “add a negative login test”, “switch reports to Allure”, “add a Jenkinsfile”. Changed files are checked the same way.</p>
      </section>

      <section className="lp-section" id="stacks" aria-labelledby="stacks-h">
        <h2 id="stacks-h">{TOTAL} stacks, from Selenium to OWASP ZAP</h2>
        <div className="lp-stacks">
          {STACKS.map((g) => (
            <div key={g.group} className="lp-stack-group">
              <h3>{g.group}</h3>
              <ul>{g.items.map((i) => <li key={i.id}>{i.label}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section" id="plans" aria-labelledby="plans-h">
        <h2 id="plans-h">Free to try, with limits that keep it free</h2>
        <div className="lp-table-wrap">
          <table className="lp-table">
            <thead><tr><th scope="col">Account</th><th scope="col">How you get it</th><th scope="col">New frameworks</th><th scope="col">Also</th></tr></thead>
            <tbody>{PLANS.map((p) => <tr key={p.who}><th scope="row">{p.who}</th><td>{p.how}</td><td>{p.gen}</td><td>{p.extra}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="lp-after">Failed or interrupted generations never count against your limit.</p>
      </section>

      <section className="lp-section lp-recruiter" aria-labelledby="rec">
        <div>
          <h2 id="rec">Reviewing this project?</h2>
          <p>Use a demo account on the sign-in page. Each sign-in opens a private copy with the same role, so you can try the admin panel or the generator without seeing anyone else&apos;s work.</p>
          <LandingCta secondary={false} />
        </div>
        <div>
          <h3>Built with</h3>
          <ul className="lp-built">{BUILT_WITH.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      </section>

      <footer className="lp-footer">
        <span>AutoScript Agent</span>
        <span>Generated code is yours. Only test applications you own or are allowed to test.</span>
      </footer>
    </div>
  );
}

import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendMagicLinkEmail(email: string, url: string) {
  if (!resend) {
    // Dev fallback: no email service configured → print the link to the server log.
    console.log(`\n🔗 Magic link for ${email}:\n${url}\n`);
    return;
  }
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || "AutoScript Agent <onboarding@resend.dev>",
    to: email,
    subject: "Your AutoScript Agent sign-in link",
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px">
      <h2>Sign in to AutoScript Agent</h2>
      <p>Click the button below to sign in. This link expires in 5 minutes.</p>
      <p><a href="${url}" style="display:inline-block;background:#22d3a6;color:#04131a;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Sign in</a></p>
      <p style="color:#666;font-size:13px">If you didn't request this, you can ignore this email.</p></div>`,
  });
  if (error) throw new Error(`Email failed: ${error.message}`);
}

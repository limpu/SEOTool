interface VerificationEmailData {
  name: string;
  otp: string;
}

export function verificationEmailTemplate(data: VerificationEmailData): {
  html: string;
  text: string;
} {
  const { name, otp } = data;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify your email</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#0f172a;padding:28px 40px;">
              <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">AI SEO Platform</span>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 16px;font-size:24px;color:#0f172a;">Verify your email</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                Hi ${name}, please use the verification code below to confirm your email address.
                This code expires in <strong>3 hours</strong>.
              </p>
              <div style="background:#f1f5f9;border-radius:8px;padding:24px;text-align:center;margin:0 0 24px;">
                <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#0f172a;font-family:'Courier New',monospace;">${otp}</span>
              </div>
              <p style="margin:0 0 8px;font-size:14px;color:#64748b;line-height:1.6;">
                If you didn't create an account, you can safely ignore this email.
              </p>
              <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">
                Do not share this code with anyone.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
                AI SEO Intelligence Platform &mdash; Automated with care.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Verify your email — AI SEO Platform\n\nHi ${name},\n\nYour verification code is:\n\n${otp}\n\nThis code expires in 3 hours. Do not share it with anyone.\n\nIf you didn't create an account, ignore this email.`;

  return { html, text };
}

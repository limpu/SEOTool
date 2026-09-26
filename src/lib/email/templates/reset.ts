interface ResetPasswordEmailData {
  name: string;
  resetUrl: string;
}

export function resetPasswordEmailTemplate(data: ResetPasswordEmailData): {
  html: string;
  text: string;
} {
  const { name, resetUrl } = data;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your password</title>
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
              <h1 style="margin:0 0 16px;font-size:24px;color:#0f172a;">Reset your password</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                Hi ${name}, we received a request to reset your password. Click the button below to proceed.
                This link expires in <strong>1 hour</strong>.
              </p>
              <div style="text-align:center;margin:0 0 24px;">
                <a href="${resetUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:6px;text-decoration:none;">
                  Reset Password
                </a>
              </div>
              <p style="margin:0 0 8px;font-size:14px;color:#64748b;line-height:1.6;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 24px;font-size:13px;color:#2563eb;word-break:break-all;">${resetUrl}</p>
              <div style="background:#fef9c3;border:1px solid #fde047;border-radius:6px;padding:16px;font-size:14px;color:#713f12;line-height:1.6;">
                <strong>Security notice:</strong> If you did not request a password reset, please ignore this email. Your password will not be changed.
              </div>
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

  const text = `Reset your password — AI SEO Platform\n\nHi ${name},\n\nWe received a request to reset your password.\n\nReset link: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request a password reset, ignore this email. Your password will not be changed.`;

  return { html, text };
}

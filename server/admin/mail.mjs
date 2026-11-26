// Only the configured administrator receives codes. The browser cannot choose
// a recipient, sender, provider endpoint or message body.
export function adminMailer(
  env = {},
  fetcher = (url, options) => globalThis.fetch(url, options),
) {
  const key = String(env.RESEND_API_KEY || ''),
    from = String(env.ADMIN_MAIL_FROM || 'onboarding@resend.dev');
  if (!key.startsWith('re_') || key.length < 16 || /[\r\n]/.test(from))
    return null;
  return async ({to, code, expiresMinutes}) => {
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: 'Boost Circuit admin sign-in code',
          text: `Your Boost Circuit admin code is ${code}. It expires in ${expiresMinutes} minutes and works only in the browser that requested it.\n\nDo not share this code. If you did not request it, ignore this email.`,
        }),
      });
      if (!response.ok) throw Error('Admin email delivery failed.');
    } finally {
      clearTimeout(timeout);
    }
  };
}

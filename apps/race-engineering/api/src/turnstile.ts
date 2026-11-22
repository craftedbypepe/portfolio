// Cloudflare Turnstile server-side check (the human check before live AI).

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const verifyTurnstile = async (
  secret: string,
  token: string,
  ip: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> => {
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set('remoteip', ip);
  try {
    const res = await fetchImpl(VERIFY_URL, { method: 'POST', body: form });
    const body = (await res.json()) as { success?: boolean };
    return body.success === true;
  } catch {
    return false;
  }
};

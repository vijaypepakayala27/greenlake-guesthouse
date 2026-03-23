import { SignJWT, jwtVerify } from 'jose';

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-dev-secret-change-in-prod');
}

export async function signToken(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret());
}

export async function verifyToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export function isApiKeyValid(key: string | null): boolean {
  const expected = process.env.BOOKING_API_KEY;
  return !!expected && key === expected;
}

export async function isAuthorized(req: Request): Promise<boolean> {
  const apiKey = req.headers.get('x-api-key');
  if (isApiKeyValid(apiKey)) return true;

  // Check JWT cookie
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(/auth_token=([^;]+)/);
  const token = match?.[1];
  return verifyToken(token);
}

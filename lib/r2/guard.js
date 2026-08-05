import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { isValidApiKey } from './client';
import { resolveScope, isValidScope } from './scope';

export async function requireAuth(req) {
  const session = await getServerSession(authOptions);
  if (!session && !isValidApiKey(req)) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { session };
}

export async function requireAuthAndScope(req, scopeName) {
  const session = await getServerSession(authOptions);
  if (!session && !isValidApiKey(req)) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!isValidScope(scopeName)) {
    return { error: NextResponse.json({ error: 'Invalid scope' }, { status: 400 }) };
  }
  return { scope: resolveScope(scopeName), session };
}

export function badRequest(message) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function serverError(message = 'Internal error') {
  return NextResponse.json({ error: message }, { status: 500 });
}

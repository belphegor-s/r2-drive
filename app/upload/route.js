import { redirect, RedirectType } from 'next/navigation';

export function GET() {
  // Private is the default drive; public is the exception.
  return redirect('/upload/private', RedirectType.replace);
}

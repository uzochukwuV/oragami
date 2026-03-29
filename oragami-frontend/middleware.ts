import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3210';

export async function middleware(request: NextRequest) {
  const wallet = request.cookies.get('wallet')?.value;

  if (!wallet) {
    return NextResponse.redirect(new URL('/onboard/connect', request.url));
  }

  try {
    const res = await fetch(
      `${API_BASE_URL}/api/credentials/${wallet}/verify`
    );

    if (!res.ok) {
      return NextResponse.redirect(new URL('/onboard/connect', request.url));
    }

    const data = await res.json();

    if (data.status !== 'active') {
      if (data.status === 'pending') {
        return NextResponse.redirect(new URL('/onboard/pending', request.url));
      }
      return NextResponse.redirect(new URL('/onboard/connect', request.url));
    }

    return NextResponse.next();
  } catch {
    // Backend unreachable — let the page handle it gracefully
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/app/:path*'],
};

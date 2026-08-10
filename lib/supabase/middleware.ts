import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public, no-login routes: the home/login screen, API routes (auth
  // checked inside each route handler), the public volunteer
  // signup pages (visited by the public + fetched server-to-server
  // by the WordPress plugin), and the InKind kiosk (runs on physical
  // donation-intake devices with no staff login by design - session-ID
  // scoped instead, same as the standalone kiosk app it was ported from).
  const isPublicPageRoute =
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname.startsWith("/volunteer/public") ||
    request.nextUrl.pathname.startsWith("/inkind/") ||
    request.nextUrl.pathname === "/inkind";
  const isApiRoute = request.nextUrl.pathname.startsWith("/api");

  if (!user && !isPublicPageRoute && !isApiRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

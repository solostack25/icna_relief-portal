import Nav from "./Nav";

// No login-page bypass needed here — auth for /inkind-admin is handled
// by the portal's global middleware (AD SSO) plus the program-access
// gate in app/inkind-admin/layout.tsx, unlike the standalone admin app
// this was ported from, which had its own email/password login.
export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <div className="max-w-5xl mx-auto">{children}</div>
    </>
  );
}

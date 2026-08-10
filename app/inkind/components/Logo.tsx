export default function Logo({ className = "h-10 w-auto" }: { className?: string }) {
  return <img src="/logo.png" alt="ICNA Relief" className={className} />;
}

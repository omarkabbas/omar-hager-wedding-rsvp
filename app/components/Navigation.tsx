"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/registry", label: "Registry" },
  { href: "/gallery", label: "Gallery" },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="wedding-nav-shell wedding-animate-fade">
      <div className="wedding-nav-inner">
        {links.map((link) => {
          const active = pathname === link.href;

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`wedding-nav-link ${active ? "wedding-nav-link-active" : "hover:text-stone-900"}`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

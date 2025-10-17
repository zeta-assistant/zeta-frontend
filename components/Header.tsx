// components/Header.tsx
"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

type Props = {
  authed?: boolean;
  avatarUrl?: string;
  planPill?: React.ReactNode; // e.g. <PlanTag plan={plan} />
  onLogout?: () => void;
};

export default function Header({ authed, avatarUrl, planPill, onLogout }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
        {/* Brand */}
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <Image src="/pantheon.png" alt="Pantheon" width={32} height={32} className="shrink-0" />
          <span className="truncate text-base font-semibold text-slate-900">Pantheon</span>
        </Link>

        <div className="grow" />

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          <Link href="/projects" className="text-slate-700 hover:text-indigo-600">Projects</Link>
          <Link href="/settings" className="text-slate-700 hover:text-indigo-600">Account</Link>
          <Link href="/support" className="text-slate-700 hover:text-indigo-600">Support</Link>

          {!authed ? (
            <Link
              href="/login?next=/"
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Log in
            </Link>
          ) : (
            <div className="ml-1 flex items-center gap-3 border-l pl-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatarUrl || "/user-faceless.svg"}
                alt="User"
                width={28}
                height={28}
                className="h-7 w-7 rounded-full border bg-gray-50 object-cover"
                onError={(e) => ((e.currentTarget as HTMLImageElement).src = "/user-faceless.svg")}
              />
              {planPill}
              <button
                onClick={onLogout}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Log out
              </button>
            </div>
          )}
        </nav>

        {/* Mobile menu button */}
        <button
          className="md:hidden rounded-md border px-3 py-2 text-sm"
          onClick={() => setOpen((s) => !s)}
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          Menu
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div id="mobile-menu" className="md:hidden border-t bg-white">
          <nav className="mx-auto max-w-6xl px-4 py-2">
            <ul className="flex flex-col">
              <li><Link href="/projects" className="block py-3">Projects</Link></li>
              <li><Link href="/settings" className="block py-3">Account</Link></li>
              <li><Link href="/support" className="block py-3">Support</Link></li>

              {!authed ? (
                <li>
                  <Link href="/login?next=/" className="mt-2 inline-block rounded-md border px-3 py-2 text-sm">
                    Log in
                  </Link>
                </li>
              ) : (
                <li>
                  <button
                    onClick={onLogout}
                    className="mt-2 inline-block w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white"
                  >
                    Log out
                  </button>
                </li>
              )}
            </ul>
          </nav>
        </div>
      )}
    </header>
  );
}

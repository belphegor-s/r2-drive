'use client';

import { signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Globe, Lock, LogOut, Keyboard } from 'lucide-react';
import CFIcon from '@/assets/cloudflare-icon.svg';

const Navbar = ({ onShowShortcuts }) => {
  const pathname = usePathname() || '';
  const isPrivate = pathname.startsWith('/upload/private');
  const isPublic = pathname.startsWith('/upload/public');

  return (
    <nav className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-3 py-2.5 sm:px-4">
      <h1 className="flex items-center gap-2 text-base font-semibold sm:text-xl">
        <Image src={CFIcon} alt="Cloudflare" width={28} height={28} priority />
        <span className="hidden sm:inline">R2 Drive</span>
      </h1>

      {(isPublic || isPrivate) && (
        <div className="relative flex items-center rounded-full border border-line bg-sunken p-1">
          {[
            { href: '/upload/private', icon: <Lock size={14} />, label: 'Private', active: isPrivate },
            { href: '/upload/public', icon: <Globe size={14} />, label: 'Public', active: isPublic },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors sm:px-4 sm:text-sm ${
                item.active ? 'text-white' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {item.active && (
                <motion.span
                  layoutId="navPill"
                  className="absolute inset-0 -z-0 rounded-full bg-accent"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {item.icon} {item.label}
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        {onShowShortcuts && (
          <button
            onClick={onShowShortcuts}
            className="hidden rounded-lg border border-line bg-raised p-2 text-ink-muted transition-colors hover:bg-hover hover:text-ink sm:block"
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
          >
            <Keyboard size={15} />
          </button>
        )}
        <motion.button
          whileTap={{ scale: 0.96 }}
          whileHover={{ y: -1 }}
          onClick={() => signOut()}
          className="flex items-center gap-1.5 rounded-lg bg-red-900/70 px-3 py-1.5 text-xs text-white transition-colors hover:bg-red-800 sm:text-sm"
        >
          <LogOut size={14} />
          <span className="hidden sm:inline">Sign out</span>
        </motion.button>
      </div>
    </nav>
  );
};

export default Navbar;

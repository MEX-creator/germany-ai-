"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  open: boolean;
  onToggle: () => void;
}

/**
 * Hamburger menu button for mobile sidebar toggle.
 * Renders a floating button that opens/closes the sidebar overlay.
 */
export function MobileNav({ open, onToggle }: MobileNavProps) {
  return (
    <button
      onClick={onToggle}
      className="fixed left-4 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-md transition-all md:hidden"
      aria-label={open ? "Close menu" : "Open menu"}
    >
      {open ? (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5 text-zinc-700">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5 text-zinc-700">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      )}
    </button>
  );
}

/**
 * Mobile sidebar overlay — slides in from left on mobile.
 */
interface SidebarOverlayProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function SidebarOverlay({ open, onClose, children }: SidebarOverlayProps) {
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-zinc-200 bg-white transition-transform duration-200 md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {children}
      </aside>
    </>
  );
}

"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className="text-sm text-[#8B7FA0] transition-colors hover:text-[#E8E0F0]"
    >
      Sign out
    </button>
  );
}

"use client";

/**
 * Platform-provided sign-out control — wraps a designed button's markup and
 * calls NextAuth signOut() on click. The Remix emitter targets this for a
 * <button> carrying auth:{mode:"signout"}. In the static gallery preview the
 * interpreter renders the plain button (no-op); only remix wires the sign-out.
 */
import * as React from "react";
import { signOut } from "next-auth/react";

export function SignOutButton(props: {
  callbackUrl?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={props.className}
      onClick={() => signOut({ callbackUrl: props.callbackUrl || "/" })}
    >
      {props.children}
    </button>
  );
}

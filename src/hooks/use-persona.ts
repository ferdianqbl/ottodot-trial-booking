"use client";

import { useSyncExternalStore } from "react";

/**
 * Who this browser tab is acting as: a parent id or "staff". Stored per tab (sessionStorage),
 * so two tabs can be two different parents for the last-seat race demo. Sent to the API as the
 * `x-demo-user` header; it stands in for real sign-in.
 */
const KEY = "ottodot.demo-user";
const listeners = new Set<() => void>();

export function getPersona(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(KEY);
}

export function setPersona(value: string) {
  window.sessionStorage.setItem(KEY, value);
  listeners.forEach((notify) => notify());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePersona() {
  return useSyncExternalStore(subscribe, getPersona, () => null);
}

// Shared layout classes. Plain constants, so server and client components can both import them.

/** Page width for every page: full width with side padding, capped for ultrawide screens. */
export const SHELL = "mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-10";

/**
 * The left column on wide screens stays in view while the right one scrolls. It never grows taller
 * than the screen (minus the recipient tray, which sets --tray-space), scrolling inside instead.
 */
export const STICKY_SIDE =
  "lg:sticky lg:top-6 lg:max-h-[calc(100dvh_-_3rem_-_var(--tray-space,0px))] lg:overflow-y-auto lg:pb-1";

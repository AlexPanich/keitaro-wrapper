import type { ReactNode } from 'react';

export type TagTone = 'muted' | 'ok' | 'warn' | 'bad' | 'draft';

/** Небольшая цветная метка состояния рядом с текстом. */
export default function Tag({ children, tone = 'muted' }: { children: ReactNode; tone?: TagTone }) {
  return <span className={`tag tag--${tone}`}>{children}</span>;
}

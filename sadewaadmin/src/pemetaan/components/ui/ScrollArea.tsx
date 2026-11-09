'use client';

import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export function ScrollArea({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={clsx('ui-scroll-area overflow-auto overscroll-contain', className)} {...props}>
      {children}
    </div>
  );
}

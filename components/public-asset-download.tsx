'use client';

import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { publicAssetUrl } from '@/lib/public-asset-url';

type PublicAssetDownloadProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'download'> & {
  children: ReactNode;
  fileName: string;
};

export function PublicAssetDownload({ children, fileName, ...props }: PublicAssetDownloadProps) {
  const resolveHref = (anchor: HTMLAnchorElement) => {
    anchor.href = publicAssetUrl(fileName);
  };

  return (
    <a
      {...props}
      href={`/${fileName.replace(/^\/+/, '')}`}
      download
      onPointerEnter={(event) => resolveHref(event.currentTarget)}
      onFocus={(event) => resolveHref(event.currentTarget)}
      onClick={(event) => resolveHref(event.currentTarget)}
    >
      {children}
    </a>
  );
}

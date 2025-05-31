import type { ReactNode } from 'react';

type PageTitleProps = {
  title: string;
  description?: string | ReactNode;
  children?: ReactNode; // For action buttons or other elements
};

export function PageTitle({ title, description, children }: PageTitleProps) {
  return (
    <div className="mb-6 md:mb-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <h1 className="text-2xl font-headline font-semibold text-foreground sm:text-3xl">{title}</h1>
        {children && <div className="flex items-center gap-2 mt-2 md:mt-0">{children}</div>}
      </div>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

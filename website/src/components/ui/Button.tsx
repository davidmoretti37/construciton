import Link from 'next/link';

type Variant = 'primary' | 'secondary' | 'ghost';

export default function Button({
  children,
  href,
  variant = 'primary',
  className = '',
  ...props
}: {
  children: React.ReactNode;
  href?: string;
  variant?: Variant;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 text-sm sm:text-base cursor-pointer';

  const variants: Record<Variant, string> = {
    primary:
      'bg-primary text-white px-6 py-3 hover:bg-blue-700 hover:shadow-lg hover:shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]',
    secondary:
      'bg-surface-2 border border-border text-foreground px-6 py-3 hover:bg-gray-200',
    ghost: 'text-text-secondary hover:text-foreground px-4 py-2',
  };

  const classes = `${base} ${variants[variant]} ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}

import Link from 'next/link';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-9 px-4 text-[13px]',
  md: 'h-10 px-5 text-sm',
  lg: 'h-12 px-6 text-[15px]',
};

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-[#0071e3] text-white hover:bg-[#005bb5] active:scale-[0.97] shadow-[0_1px_2px_rgba(0,0,0,0.06),0_2px_4px_rgba(0,113,227,0.18)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.08),0_8px_16px_rgba(0,113,227,0.22)]',
  secondary:
    'bg-[#171717] text-white hover:bg-[#2d2d2d] active:scale-[0.97] shadow-[0_1px_2px_rgba(0,0,0,0.06),0_2px_4px_rgba(0,0,0,0.10)]',
  ghost:
    'bg-white text-[#171717] ring-1 ring-inset ring-black/10 hover:bg-[#f5f5f5] hover:ring-black/15 active:scale-[0.97]',
  danger:
    'bg-[#ff3b30] text-white hover:bg-[#d92d24] active:scale-[0.97] shadow-[0_1px_2px_rgba(0,0,0,0.06),0_2px_4px_rgba(255,59,48,0.20)]',
};

export default function Button({
  children,
  href,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: {
  children: React.ReactNode;
  href?: string;
  variant?: Variant;
  size?: Size;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fafafa]';

  const classes = `${base} ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`;

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

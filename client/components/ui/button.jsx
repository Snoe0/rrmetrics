const React = require('react');
const { Slot } = require('@radix-ui/react-slot');
const { cva } = require('class-variance-authority');
const { cn } = require('../../lib/utils');

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-text hover:bg-accent/90',
        destructive: 'bg-negative text-white hover:bg-negative/90',
        outline: 'border border-border bg-transparent text-text-secondary hover:bg-bg-input hover:text-text-primary',
        secondary: 'bg-bg-input text-text-primary hover:bg-bg-input/80',
        ghost: 'hover:bg-bg-input hover:text-text-primary',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

module.exports = { Button, buttonVariants };

/**
 * @restaurant/ui — the platform's single component library.
 *
 * One copy, three apps. These primitives used to live twice, byte-identical,
 * in apps/web and apps/admin, which meant every fix had to be made in both and
 * a design change could land in one and not the other. A design system that
 * exists in two places is two design systems.
 *
 * Built on shadcn/ui patterns over Radix. Add a component with
 *   pnpm dlx shadcn@latest add <name>
 * from this package, then re-export it below.
 *
 * Styling comes from the token layer in ./styles/tokens.css — components
 * reference semantic names (bg-primary, text-muted-foreground), never raw
 * colours, so a new palette is a token change and not a component rewrite.
 */

/**
 * ./console — the product's own primitives.
 *
 * The shadcn set below is generic: a button, a dialog, a select. These are the
 * pieces the *design* specifies — a KPI card with a rail that must mean
 * something, a donut at 132px with a butt-capped stroke, a bar chart whose
 * heights are in pixels because percentages collapse. Twenty-five screens draw
 * them, and drawing them twenty-five times is how a design system becomes a
 * folder of near-misses.
 */
export * from './console/charts';
export * from './console/data-table';
export * from './console/kpi';
export * from './console/panel';
export * from './console/segmented';
export * from './console/state';
export * from './console/status';

export * from './components/accordion';
export * from './components/alert';
export * from './components/alert-dialog';
export * from './components/avatar';
export * from './components/badge';
export * from './components/button';
export * from './components/card';
export * from './components/checkbox';
export * from './components/command';
export * from './components/dialog';
export * from './components/dropdown-menu';
export * from './components/form';
export * from './components/input';
export * from './components/label';
export * from './components/popover';
export * from './components/radio-group';
export * from './components/select';
export * from './components/separator';
export * from './components/sheet';
export * from './components/skeleton';
export * from './components/sonner';
export * from './components/switch';
export * from './components/table';
export * from './components/tabs';
export * from './components/textarea';
export * from './components/tooltip';

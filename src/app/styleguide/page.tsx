import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Dev-only theme review page. Not part of the product — not linked from
// anywhere a user would reach it, and not built in production.
export default function StyleguidePage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-16 px-8 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground font-sans text-sm">
          Dev-only · not part of the product
        </p>
        <h1 className="font-display text-5xl">Starmap styleguide</h1>
        <p className="text-muted-foreground max-w-prose font-sans">
          Every design token, both typefaces, and one example of each installed
          shadcn component, for reviewing the night-sky theme.
        </p>
      </header>

      <Section title="Colour tokens">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {tokens.map((token) => (
            <Swatch key={token.name} {...token} />
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground font-sans text-sm">
              font-sans — Inter, for body copy and UI
            </p>
            {sizes.map((size) => (
              <p key={size.className} className={`font-sans ${size.className}`}>
                {size.label} — The quiet orbit of a well-kept plan.
              </p>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground font-sans text-sm">
              font-display — Instrument Serif, for display headings
            </p>
            {sizes.map((size) => (
              <p
                key={size.className}
                className={`font-display ${size.className}`}
              >
                {size.label} — The quiet orbit of a well-kept plan.
              </p>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Button">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Save goal</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Delete</Button>
          <Button variant="link">Link</Button>
        </div>
      </Section>

      <Section title="Badge">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </Section>

      <Section title="Input & Label">
        <div className="flex max-w-sm flex-col gap-2">
          <Label htmlFor="styleguide-goal">Goal title</Label>
          <Input id="styleguide-goal" placeholder="Move to London" />
        </div>
      </Section>

      <Section title="Select">
        <Select defaultValue="green">
          <SelectTrigger className="w-48">
            <SelectValue placeholder="RAG status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="green">Green</SelectItem>
            <SelectItem value="amber">Amber</SelectItem>
            <SelectItem value="red">Red</SelectItem>
            <SelectItem value="grey">Grey — Undefined</SelectItem>
          </SelectContent>
        </Select>
      </Section>

      <Section title="Card">
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Move to London</CardTitle>
            <CardDescription>Shared goal · GBP 15,000 target</CardDescription>
            <CardAction>
              <Badge>Green</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Pledged £13,000 of £15,000. On schedule, 100 days to go.
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full">
              View goal
            </Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark milestone complete</DialogTitle>
              <DialogDescription>
                This lights the milestone up on the timeline.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button>Confirm</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-2xl">{title}</h2>
      {children}
    </section>
  );
}

function Swatch({
  name,
  cssVar,
  hex,
  note,
}: {
  name: string;
  cssVar: string;
  hex: string;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="border-subtle h-16 rounded-lg border"
        style={{ backgroundColor: `var(${cssVar})` }}
      />
      <div className="flex flex-col font-sans text-xs">
        <span className="text-foreground font-medium">{name}</span>
        <span className="text-muted-foreground">
          {cssVar} · {hex}
        </span>
        {note && <span className="text-muted-foreground">{note}</span>}
      </div>
    </div>
  );
}

const tokens: { name: string; cssVar: string; hex: string; note?: string }[] = [
  {
    name: "bg-deep",
    cssVar: "--bg-deep",
    hex: "#0A0918",
    note: "page background",
  },
  {
    name: "bg-surface",
    cssVar: "--bg-surface",
    hex: "#14122E",
    note: "cards, panels",
  },
  {
    name: "bg-raised",
    cssVar: "--bg-raised",
    hex: "#1E1B3D",
    note: "hover, elevated",
  },
  { name: "border-subtle", cssVar: "--border-subtle", hex: "#2A2650" },
  {
    name: "primary",
    cssVar: "--primary",
    hex: "#8B7BD8",
    note: "primary actions",
  },
  {
    name: "primary-soft",
    cssVar: "--primary-soft",
    hex: "#B9A9F5",
    note: "hover, focus rings",
  },
  {
    name: "star",
    cssVar: "--star",
    hex: "#F5D89E",
    note: "completions, achievements",
  },
  { name: "text-primary", cssVar: "--text-primary", hex: "#EDEBFA" },
  { name: "text-muted", cssVar: "--text-muted", hex: "#9B96C7" },
  { name: "rag-green", cssVar: "--rag-green", hex: "#4FB8A5" },
  { name: "rag-amber", cssVar: "--rag-amber", hex: "#D9A05B" },
  { name: "rag-red", cssVar: "--rag-red", hex: "#C9566B" },
  { name: "rag-grey", cssVar: "--rag-grey", hex: "#6B7280" },
];

const sizes = [
  { className: "text-sm", label: "sm" },
  { className: "text-base", label: "base" },
  { className: "text-xl", label: "xl" },
  { className: "text-3xl", label: "3xl" },
  { className: "text-5xl", label: "5xl" },
];

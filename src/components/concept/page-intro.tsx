import Link from "next/link";
import { ChevronLeftIcon } from "../icons";

export function PageIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="mb-8">
      <Link href="/demo" className="mb-4 inline-flex items-center gap-1 text-sm font-medium no-underline">
        <ChevronLeftIcon className="size-4" /> All demos
      </Link>
      <p className="text-sm font-semibold uppercase tracking-wider text-sea">{eyebrow}</p>
      <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-ink-muted">{text}</p>
    </div>
  );
}

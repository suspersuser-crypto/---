import { lazy, Suspense, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { YardSite, type YardWish } from "@/components/yard-site";

const YardApp = lazy(() => import("@/components/yard-app").then((m) => ({ default: m.YardApp })));

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [wish, setWish] = useState<YardWish | null>(null);
  if (!wish) return <YardSite onPlay={setWish} />;
  return (
    <Suspense fallback={<p className="grid h-dvh place-items-center bg-bg font-display text-2xl">Собираем двор…</p>}>
      <YardApp boot={wish.mode} wish={wish} onExit={() => setWish(null)} />
    </Suspense>
  );
}
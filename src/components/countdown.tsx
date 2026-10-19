"use client";

import { useEffect, useState } from "react";

export function Countdown({ until }: { until: string }) {
  const [left, setLeft] = useState(() => Math.max(0, new Date(until).getTime() - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, new Date(until).getTime() - Date.now())), 1000);
    return () => clearInterval(id);
  }, [until]);
  const s = Math.floor(left / 1000);
  return (
    <span className="tabular-nums" suppressHydrationWarning>
      {left === 0 ? "Expired" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} left`}
    </span>
  );
}

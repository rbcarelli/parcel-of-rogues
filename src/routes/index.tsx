import { createFileRoute } from "@tanstack/react-router";
import { PirateChart } from "@/components/pirate-chart";
import { getVesselAis } from "@/lib/vessel-ais";

export const Route = createFileRoute("/")({
  loader: () => getVesselAis(),
  component: Home,
});

function Home() {
  const data = Route.useLoaderData();
  return <PirateChart initial={data} />;
}

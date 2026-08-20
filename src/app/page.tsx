import LocationPicker from "@/components/LocationPicker";
import { getDb } from "@/lib/db";
import { forPublic } from "@/lib/hours";

// The menu is editable from the manager admin, so the public pages read the Db
// on every request — an edit has to show up on the next refresh.
export const dynamic = "force-dynamic";

export default async function Home() {
  const locations = await getDb().listLocations();
  // Seasonal cafenele show the month the visitor is in, resolved server-side.
  const now = new Date();

  return <LocationPicker locations={locations.map((l) => forPublic(l, now))} />;
}

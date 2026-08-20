import type { Db } from "./db";

/**
 * Which Google review page a member's "Lasă o recenzie" link should open.
 *
 * The member belongs to no single cafenea, so the best guess is the place
 * they actually visit: the location of their most recent stamp, when that
 * location has a review URL. Otherwise any location with one — a review for
 * ERA is worth more than no review at all. Some locations have no listing
 * yet (`reviewUrl: null`); null here means the card renders no link rather
 * than a dead one.
 */
export async function reviewUrlForMember(
  db: Db,
  memberId: string,
): Promise<string | null> {
  const [stamps, locations] = await Promise.all([
    db.getMemberStamps(memberId),
    db.listLocations(),
  ]);

  const urlOf = (slug: string) =>
    locations.find((l) => l.slug === slug)?.reviewUrl ?? null;

  const lastVisited = [...stamps].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];
  if (lastVisited) {
    const url = urlOf(lastVisited.locationSlug);
    if (url) return url;
  }

  return locations.find((l) => l.reviewUrl !== null)?.reviewUrl ?? null;
}

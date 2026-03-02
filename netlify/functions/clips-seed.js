import { getStore } from "@netlify/blobs";

function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async () => {
  try {
    const store = getStore("gtc");
    const week = getWeekKey();

    const sampleClips = [
      {
        id: "clip1",
        title: "Insane 1v4 Clutch",
        gamerTag: "AlphaSnipes",
        game: "Warzone",
        clipUrl: "https://youtube.com/",
        thumbUrl: "https://picsum.photos/400/225?1",
        votes: 0
      },
      {
        id: "clip2",
        title: "No Scope Across Map",
        gamerTag: "QuickScopeKing",
        game: "Valorant",
        clipUrl: "https://youtube.com/",
        thumbUrl: "https://picsum.photos/400/225?2",
        votes: 0
      },
      {
        id: "clip3",
        title: "Last Second Ace",
        gamerTag: "ControllerGod",
        game: "CS2",
        clipUrl: "https://youtube.com/",
        thumbUrl: "https://picsum.photos/400/225?3",
        votes: 0
      }
    ];

    await store.set(`clips:${week}`, JSON.stringify(sampleClips));

    return new Response(JSON.stringify({ ok: true, week, count: sampleClips.length }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Seed failed", detail: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
};

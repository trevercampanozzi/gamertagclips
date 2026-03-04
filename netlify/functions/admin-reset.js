import { getStore } from "@netlify/blobs";

export default async () => {

  const store = getStore("clips");

  const { blobs } = await store.list();

  for (const blob of blobs) {
    await store.delete(blob.key);
  }

  return new Response(JSON.stringify({
    ok: true,
    message: "All clips deleted"
  }), { status: 200 });
};

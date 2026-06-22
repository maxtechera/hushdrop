// Public Supabase config for the browser (anon key + URL are safe to expose).
export default function handler(req, res) {
  res.setHeader("cache-control", "public, max-age=300");
  return res.status(200).json({
    url: process.env.SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || "",
  });
}

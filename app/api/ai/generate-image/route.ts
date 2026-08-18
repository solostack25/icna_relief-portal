import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateImage } from "@/lib/ai/azureOpenAI";

// General-purpose AI image generation, added alongside the Portal
// Assistant since both run on the same Azure OpenAI resource. Not
// wired into any UI yet — the Flier Builder currently uses Pexels
// stock photos (lib/ ... flier builder). This route exists so that
// capability can be added as an option there (or anywhere else that
// wants an on-brand generated image) without new backend work.

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const prompt = body?.prompt as string | undefined;
  const size = (body?.size as "1024x1024" | "1792x1024" | "1024x1792" | undefined) ?? "1024x1024";
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Expected a non-empty 'prompt'." }, { status: 400 });
  }

  try {
    const result = await generateImage(prompt.trim(), size);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image generation hit an unexpected error." },
      { status: 500 }
    );
  }
}

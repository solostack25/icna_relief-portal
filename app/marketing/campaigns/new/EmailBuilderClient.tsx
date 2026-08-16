"use client";

import { useState } from "react";
import { newBlock, renderBlocksToHtml, type EmailBlock } from "@/lib/emailBlocks";

const BLOCK_TYPES: { type: EmailBlock["type"]; label: string }[] = [
  { type: "heading", label: "Heading" },
  { type: "text", label: "Text" },
  { type: "image", label: "Image" },
  { type: "button", label: "Button" },
  { type: "divider", label: "Divider" },
  { type: "spacer", label: "Spacer" },
];

export default function EmailBuilderClient({
  blocks,
  onChange,
}: {
  blocks: EmailBlock[];
  onChange: (blocks: EmailBlock[]) => void;
}) {
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const updateBlock = (id: string, patch: Partial<EmailBlock>) => {
    onChange(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as EmailBlock) : b)));
  };
  const removeBlock = (id: string) => onChange(blocks.filter((b) => b.id !== id));
  const addBlock = (type: EmailBlock["type"]) => onChange([...blocks, newBlock(type)]);
  const moveBlock = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const runAiAssist = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiError(null);
    const res = await fetch("/api/marketing/campaigns/ai-assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: aiPrompt }),
    });
    const data = await res.json();
    setAiLoading(false);
    if (!res.ok) {
      setAiError(data.error ?? "AI Assist failed");
      return;
    }
    onChange([...blocks, ...data.blocks]);
    setAiPrompt("");
    setShowAiPanel(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500">Email content</span>
        <button
          onClick={() => setShowAiPanel((v) => !v)}
          className="text-xs px-3 py-1.5 rounded font-medium text-white"
          style={{ background: "#3E7C9A" }}
        >
          ✨ AI Assist
        </button>
      </div>

      {showAiPanel && (
        <div className="border rounded p-3 mb-4 bg-blue-50">
          <textarea
            className="border rounded px-3 py-2 w-full text-sm mb-2"
            rows={3}
            placeholder="Describe what this email should say — e.g. 'A warm thank-you email for donors who gave during Ramadan, with a button linking to our impact report'"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={runAiAssist}
              disabled={aiLoading || !aiPrompt.trim()}
              className="text-xs px-3 py-1.5 rounded font-medium text-white disabled:opacity-50"
              style={{ background: "#3E7C9A" }}
            >
              {aiLoading ? "Generating..." : "Generate content"}
            </button>
            <span className="text-[11px] text-gray-500">Adds blocks below — review and edit before sending.</span>
          </div>
          {aiError && <p className="text-xs text-red-600 mt-2">{aiError}</p>}
        </div>
      )}

      <div className="space-y-3 mb-4">
        {blocks.map((block, i) => (
          <div key={block.id} className="border rounded p-3 relative group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wide text-gray-400">{block.type}</span>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <button onClick={() => moveBlock(i, -1)} disabled={i === 0}>↑</button>
                <button onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1}>↓</button>
                <button onClick={() => removeBlock(block.id)} className="text-red-400">✕</button>
              </div>
            </div>

            {(block.type === "heading" || block.type === "text") && (
              <>
                <textarea
                  className="border rounded px-2 py-1.5 w-full text-sm mb-2"
                  rows={block.type === "heading" ? 1 : 3}
                  value={block.text}
                  onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                />
                <select
                  className="border rounded px-2 py-1 text-xs"
                  value={block.align}
                  onChange={(e) => updateBlock(block.id, { align: e.target.value as "left" | "center" })}
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                </select>
              </>
            )}

            {block.type === "image" && (
              <div className="space-y-2">
                <input
                  className="border rounded px-2 py-1.5 w-full text-sm"
                  placeholder="Image URL"
                  value={block.imageUrl}
                  onChange={(e) => updateBlock(block.id, { imageUrl: e.target.value })}
                />
                <input
                  className="border rounded px-2 py-1.5 w-full text-sm"
                  placeholder="Alt text"
                  value={block.alt}
                  onChange={(e) => updateBlock(block.id, { alt: e.target.value })}
                />
              </div>
            )}

            {block.type === "button" && (
              <div className="flex gap-2">
                <input
                  className="border rounded px-2 py-1.5 text-sm flex-1"
                  placeholder="Button label"
                  value={block.label}
                  onChange={(e) => updateBlock(block.id, { label: e.target.value })}
                />
                <input
                  className="border rounded px-2 py-1.5 text-sm flex-1"
                  placeholder="URL"
                  value={block.url}
                  onChange={(e) => updateBlock(block.id, { url: e.target.value })}
                />
              </div>
            )}

            {block.type === "spacer" && (
              <input
                type="number"
                className="border rounded px-2 py-1.5 text-sm w-24"
                value={block.height}
                onChange={(e) => updateBlock(block.id, { height: Number(e.target.value) })}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {BLOCK_TYPES.map((bt) => (
          <button
            key={bt.type}
            onClick={() => addBlock(bt.type)}
            className="text-xs px-3 py-1.5 rounded border font-medium"
          >
            + {bt.label}
          </button>
        ))}
      </div>

      {blocks.length > 0 && (
        <details className="mb-4">
          <summary className="text-xs text-gray-500 cursor-pointer">Preview</summary>
          <div
            className="border rounded p-4 mt-2 bg-white"
            dangerouslySetInnerHTML={{ __html: renderBlocksToHtml(blocks) }}
          />
        </details>
      )}
    </div>
  );
}

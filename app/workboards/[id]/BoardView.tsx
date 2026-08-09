"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/lib/supabase/client";
import { addManualCard, addColumn, renameColumn, moveCard } from "@/lib/workboard";
import { formatTicketAge } from "@/lib/helpdesk";

type Column = { id: string; board_id: string; name: string; sort_order: number };
type Card = {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  linked_leg_id: string | null;
  sort_order: number;
  created_at: string;
};

export default function BoardView({
  boardId,
  columns: initialColumns,
  cards: initialCards,
  legToRequest,
  currentUserId,
  canEditColumns,
}: {
  boardId: string;
  columns: Column[];
  cards: Card[];
  legToRequest: Record<string, string>;
  currentUserId: string;
  canEditColumns: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();

  const [columns, setColumns] = useState(initialColumns);
  const [cards, setCards] = useState(initialCards);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [addingCardTo, setAddingCardTo] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnName, setEditingColumnName] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const cardsByColumn = (columnId: string) =>
    cards.filter((c) => c.column_id === columnId).sort((a, b) => a.sort_order - b.sort_order);

  function handleDragStart(event: DragStartEvent) {
    const card = cards.find((c) => c.id === event.active.id);
    setActiveCard(card ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    if (activeId === overId) return;

    const activeCardData = cards.find((c) => c.id === activeId);
    if (!activeCardData) return;

    // Dropping over another card -> join that card's column.
    // Dropping over a column itself (empty space) -> that column id.
    const overCard = cards.find((c) => c.id === overId);
    const overColumnId = overCard ? overCard.column_id : columns.some((c) => c.id === overId) ? overId : null;
    if (!overColumnId || overColumnId === activeCardData.column_id) return;

    setCards((prev) => prev.map((c) => (c.id === activeId ? { ...c, column_id: overColumnId } : c)));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    const activeCardData = cards.find((c) => c.id === activeId);
    if (!activeCardData) return;

    const overCard = cards.find((c) => c.id === overId);
    const targetColumnId = overCard ? overCard.column_id : columns.some((c) => c.id === overId) ? overId : activeCardData.column_id;

    const columnCards = cardsByColumn(targetColumnId);
    const oldIndex = columnCards.findIndex((c) => c.id === activeId);
    const newIndex = overCard ? columnCards.findIndex((c) => c.id === overId) : columnCards.length;

    const reordered = oldIndex >= 0 ? arrayMove(columnCards, oldIndex, newIndex) : columnCards;
    const updates = reordered.map((c, i) => ({ ...c, sort_order: i, column_id: targetColumnId }));

    setCards((prev) => {
      const others = prev.filter((c) => c.column_id !== targetColumnId && c.id !== activeId);
      return [...others, ...updates];
    });

    const finalSortOrder = updates.findIndex((c) => c.id === activeId);
    try {
      await moveCard(supabase, {
        cardId: activeId,
        newColumnId: targetColumnId,
        newSortOrder: finalSortOrder >= 0 ? finalSortOrder : 0,
      });
    } catch {
      router.refresh(); // out of sync with the server -- resync
    }
  }

  async function submitNewCard(columnId: string) {
    if (!newCardTitle.trim()) return;
    try {
      await addManualCard(supabase, {
        boardId,
        columnId,
        title: newCardTitle.trim(),
        createdByEmployeeId: currentUserId,
      });
      setNewCardTitle("");
      setAddingCardTo(null);
      router.refresh();
    } catch {
      // leave the input open so they can retry
    }
  }

  async function submitNewColumn() {
    if (!newColumnName.trim()) return;
    try {
      await addColumn(supabase, { boardId, name: newColumnName.trim() });
      setNewColumnName("");
      setAddingColumn(false);
      router.refresh();
    } catch {
      // leave open to retry
    }
  }

  function startRenameColumn(col: Column) {
    setEditingColumnId(col.id);
    setEditingColumnName(col.name);
  }

  async function submitRenameColumn() {
    if (!editingColumnId || !editingColumnName.trim()) {
      setEditingColumnId(null);
      return;
    }
    const columnId = editingColumnId;
    const name = editingColumnName.trim();
    setColumns((prev) => prev.map((c) => (c.id === columnId ? { ...c, name } : c)));
    setEditingColumnId(null);
    try {
      await renameColumn(supabase, { columnId, name });
    } catch {
      router.refresh(); // resync if it failed to persist
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 20 }}>
        {columns.map((col) => (
          <div
            key={col.id}
            id={col.id}
            style={{
              minWidth: 260,
              maxWidth: 260,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid #3A2C68",
              borderRadius: 14,
              padding: 10,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 4px 10px" }}>
              {canEditColumns && editingColumnId === col.id ? (
                <input
                  value={editingColumnName}
                  onChange={(e) => setEditingColumnName(e.target.value)}
                  onBlur={submitRenameColumn}
                  onKeyDown={(e) => e.key === "Enter" && submitRenameColumn()}
                  autoFocus
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    background: "#1A1035",
                    border: "1px solid #4A3B7A",
                    borderRadius: 6,
                    color: "#EDE6FF",
                    padding: "2px 6px",
                    width: "70%",
                  }}
                />
              ) : (
                <span
                  onClick={() => canEditColumns && startRenameColumn(col)}
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "#B5A8E8",
                    cursor: canEditColumns ? "text" : "default",
                  }}
                  title={canEditColumns ? "Click to rename" : undefined}
                >
                  {col.name}
                </span>
              )}
              <span style={{ fontSize: 10, color: "#7A6FAE", background: "rgba(255,255,255,0.06)", padding: "1px 7px", borderRadius: 20 }}>
                {cardsByColumn(col.id).length}
              </span>
            </div>

            <SortableContext items={cardsByColumn(col.id).map((c) => c.id)} strategy={verticalListSortingStrategy} id={col.id}>
              <ColumnDropZone columnId={col.id}>
                {cardsByColumn(col.id).map((card) => (
                  <SortableCard key={card.id} card={card} requestId={card.linked_leg_id ? legToRequest[card.linked_leg_id] : undefined} />
                ))}
              </ColumnDropZone>
            </SortableContext>

            {addingCardTo === col.id ? (
              <div style={{ marginTop: 6 }}>
                <input
                  value={newCardTitle}
                  onChange={(e) => setNewCardTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitNewCard(col.id)}
                  autoFocus
                  placeholder="Card title"
                  style={{
                    width: "100%",
                    padding: "7px 9px",
                    borderRadius: 8,
                    background: "#1A1035",
                    border: "1px solid #4A3B7A",
                    color: "#EDE6FF",
                    fontSize: 12.5,
                    marginBottom: 6,
                  }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => submitNewCard(col.id)}
                    style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 7, border: "none", background: "#00E5FF", color: "#150B2E", cursor: "pointer" }}
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setAddingCardTo(null)}
                    style={{ fontSize: 11, padding: "5px 10px", borderRadius: 7, border: "1px solid #4A3B7A", background: "transparent", color: "#B5A8E8", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setAddingCardTo(col.id);
                  setNewCardTitle("");
                }}
                style={{ width: "100%", textAlign: "left", padding: "7px 4px", fontSize: 12, color: "#7A6FAE", background: "transparent", border: "none", cursor: "pointer" }}
              >
                + Add card
              </button>
            )}
          </div>
        ))}

        <div style={{ minWidth: 200, flexShrink: 0 }}>
          {canEditColumns ? (
            addingColumn ? (
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid #3A2C68", borderRadius: 14, padding: 10 }}>
                <input
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitNewColumn()}
                  autoFocus
                  placeholder="Column name"
                  style={{ width: "100%", padding: "7px 9px", borderRadius: 8, background: "#1A1035", border: "1px solid #4A3B7A", color: "#EDE6FF", fontSize: 12.5, marginBottom: 6 }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={submitNewColumn} style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 7, border: "none", background: "#00E5FF", color: "#150B2E", cursor: "pointer" }}>
                    Add
                  </button>
                  <button onClick={() => setAddingColumn(false)} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 7, border: "1px solid #4A3B7A", background: "transparent", color: "#B5A8E8", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingColumn(true)}
                style={{ width: "100%", padding: 12, borderRadius: 14, border: "1px dashed #4A3B7A", background: "transparent", color: "#B5A8E8", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
              >
                + Add Column
              </button>
            )
          ) : null}
        </div>
      </div>

      <DragOverlay>
        {activeCard ? <CardTile card={activeCard} requestId={activeCard.linked_leg_id ? legToRequest[activeCard.linked_leg_id] : undefined} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function ColumnDropZone({ columnId, children }: { columnId: string; children: React.ReactNode }) {
  // A real droppable zone, not just a styled div -- without this, an
  // EMPTY column (no cards in it yet) has nothing for dnd-kit to
  // register a drop against, so cards could never be dropped into a
  // column until it already had at least one card in it.
  const { setNodeRef } = useDroppable({ id: columnId });
  return (
    <div ref={setNodeRef} style={{ minHeight: 40, display: "flex", flexDirection: "column", gap: 8 }}>
      {children}
    </div>
  );
}

function SortableCard({ card, requestId }: { card: Card; requestId?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CardTile card={card} requestId={requestId} />
    </div>
  );
}

function CardTile({ card, requestId, dragging = false }: { card: Card; requestId?: string; dragging?: boolean }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid #3A2C68",
        borderRadius: 10,
        padding: 10,
        cursor: dragging ? "grabbing" : "grab",
        boxShadow: dragging ? "0 8px 20px rgba(0,0,0,0.4)" : "none",
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>{card.title}</div>
      <div style={{ fontSize: 10, color: "#7A6FAE" }}>⏱ {formatTicketAge(card.created_at)}</div>
      {requestId && (
        <Link
          href={`/helpdesk/${requestId}`}
          onClick={(e) => e.stopPropagation()}
          style={{ display: "inline-block", marginTop: 6, fontSize: 9.5, fontWeight: 800, color: "#00E5FF", background: "rgba(0,229,255,0.1)", padding: "2px 7px", borderRadius: 20, textDecoration: "none" }}
        >
          🎫 Linked ticket
        </Link>
      )}
    </div>
  );
}

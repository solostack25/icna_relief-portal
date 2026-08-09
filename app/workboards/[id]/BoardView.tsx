"use client";

import { useRef, useState } from "react";
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
import { addManualCard, addColumn, renameColumn, setColumnStatusMapping, moveCard } from "@/lib/workboard";
import { formatTicketAge, syncLegStatusFromWorkboardColumn, LEG_STATUS_LABELS, type LegStatus } from "@/lib/helpdesk";
import CardDetailModal from "./CardDetailModal";

type Column = { id: string; board_id: string; name: string; sort_order: number; maps_to_status: string | null };
type Card = {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  linked_leg_id: string | null;
  sort_order: number;
  created_at: string;
  assigned_to_employee_id: string | null;
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "No status sync" },
  { value: "open", label: LEG_STATUS_LABELS.open },
  { value: "in_progress", label: LEG_STATUS_LABELS.in_progress },
  { value: "on_hold", label: LEG_STATUS_LABELS.on_hold },
  { value: "quality_assurance", label: LEG_STATUS_LABELS.quality_assurance },
  { value: "closed", label: LEG_STATUS_LABELS.closed },
];

const selectSmallStyle: React.CSSProperties = {
  fontSize: 10,
  padding: "2px 4px",
  borderRadius: 6,
  background: "#1A1035",
  border: "1px solid #4A3B7A",
  color: "#B5A8E8",
};

export default function BoardView({
  boardId,
  columns: initialColumns,
  cards: initialCards,
  legToRequest,
  currentUserId,
  canEditColumns,
  assignableStaff,
  assigneeNameMap: initialAssigneeNameMap,
  noteCountByCard: initialNoteCountByCard,
}: {
  boardId: string;
  columns: Column[];
  cards: Card[];
  legToRequest: Record<string, string>;
  currentUserId: string;
  canEditColumns: boolean;
  assignableStaff: { id: string; first_name: string; last_name: string }[];
  assigneeNameMap: Record<string, string>;
  noteCountByCard: Record<string, number>;
}) {
  const supabase = createClient();
  const router = useRouter();

  const [assigneeNameMap, setAssigneeNameMap] = useState(initialAssigneeNameMap);
  const [noteCountByCard, setNoteCountByCard] = useState(initialNoteCountByCard);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  const [columns, setColumns] = useState(initialColumns);
  const [cards, setCards] = useState(initialCards);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [addingCardTo, setAddingCardTo] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnStatus, setNewColumnStatus] = useState("");
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnName, setEditingColumnName] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // handleDragOver optimistically mutates a card's column_id in state
  // for the live drag preview, BEFORE handleDragEnd runs -- so by the
  // time handleDragEnd needs to know "did the column actually
  // change?", the state it would compare against has already been
  // rewritten to match. This ref captures the true starting column at
  // drag-start, untouched by that later mutation, so the comparison
  // in handleDragEnd is against reality instead of against itself.
  const originalColumnIdRef = useRef<string | null>(null);

  const cardsByColumn = (columnId: string) =>
    cards.filter((c) => c.column_id === columnId).sort((a, b) => a.sort_order - b.sort_order);

  function handleDragStart(event: DragStartEvent) {
    const card = cards.find((c) => c.id === event.active.id);
    setActiveCard(card ?? null);
    originalColumnIdRef.current = card?.column_id ?? null;
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

    // Keep the linked ticket's real status in sync with whichever
    // column its card landed in -- only if the column actually
    // changed (dragging within the same column is just reordering)
    // and that column has a status mapping set. Compares against
    // originalColumnIdRef (captured at drag-start), NOT
    // activeCardData.column_id -- that field was already overwritten
    // by handleDragOver's live-preview mutation during the drag, so
    // comparing against it would always show "no change."
    const columnChanged =
      originalColumnIdRef.current !== null && originalColumnIdRef.current !== targetColumnId;
    const targetColumn = columns.find((c) => c.id === targetColumnId);
    if (columnChanged && activeCardData.linked_leg_id && targetColumn?.maps_to_status) {
      try {
        await syncLegStatusFromWorkboardColumn(supabase, {
          legId: activeCardData.linked_leg_id,
          targetStatus: targetColumn.maps_to_status as LegStatus,
          actingEmployeeId: currentUserId,
        });
        router.refresh(); // pick up the new status if it's shown anywhere else on this page, and invalidate the client route cache for this path
      } catch {
        console.error("Failed to sync ticket status from workboard column move");
      }
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
      await addColumn(supabase, {
        boardId,
        name: newColumnName.trim(),
        mapsToStatus: newColumnStatus || null,
      });
      setNewColumnName("");
      setNewColumnStatus("");
      setAddingColumn(false);
      router.refresh();
    } catch {
      // leave open to retry
    }
  }

  async function updateColumnStatusMapping(columnId: string, value: string) {
    const mapsToStatus = value || null;
    setColumns((prev) => prev.map((c) => (c.id === columnId ? { ...c, maps_to_status: mapsToStatus } : c)));
    try {
      await setColumnStatusMapping(supabase, { columnId, mapsToStatus });
    } catch {
      router.refresh();
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

            {canEditColumns ? (
              <select
                value={col.maps_to_status ?? ""}
                onChange={(e) => updateColumnStatusMapping(col.id, e.target.value)}
                style={{ ...selectSmallStyle, width: "100%", marginBottom: 8 }}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            ) : (
              col.maps_to_status && (
                <div style={{ fontSize: 9.5, color: "#7A6FAE", marginBottom: 8 }}>
                  → sets ticket to "{LEG_STATUS_LABELS[col.maps_to_status as LegStatus]}"
                </div>
              )
            )}

            <SortableContext items={cardsByColumn(col.id).map((c) => c.id)} strategy={verticalListSortingStrategy} id={col.id}>
              <ColumnDropZone columnId={col.id}>
                {cardsByColumn(col.id).map((card) => (
                  <SortableCard
                    key={card.id}
                    card={card}
                    requestId={card.linked_leg_id ? legToRequest[card.linked_leg_id] : undefined}
                    assigneeName={card.assigned_to_employee_id ? assigneeNameMap[card.assigned_to_employee_id] : undefined}
                    noteCount={noteCountByCard[card.id] ?? 0}
                    onExpand={() => setExpandedCardId(card.id)}
                  />
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
                <select
                  value={newColumnStatus}
                  onChange={(e) => setNewColumnStatus(e.target.value)}
                  style={{ ...selectSmallStyle, width: "100%", marginBottom: 6 }}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
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

      {expandedCardId &&
        (() => {
          const card = cards.find((c) => c.id === expandedCardId);
          if (!card) return null;
          return (
            <CardDetailModal
              card={card}
              requestId={card.linked_leg_id ? legToRequest[card.linked_leg_id] : undefined}
              assignableStaff={assignableStaff}
              currentAssigneeName={card.assigned_to_employee_id ? assigneeNameMap[card.assigned_to_employee_id] ?? null : null}
              currentUserId={currentUserId}
              onClose={() => setExpandedCardId(null)}
              onAssigneeChange={(cardId, employeeId, name) => {
                setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, assigned_to_employee_id: employeeId } : c)));
                setAssigneeNameMap((prev) => {
                  const next = { ...prev };
                  if (employeeId && name) next[employeeId] = name;
                  return next;
                });
              }}
              onNoteAdded={(cardId) => {
                setNoteCountByCard((prev) => ({ ...prev, [cardId]: (prev[cardId] ?? 0) + 1 }));
              }}
            />
          );
        })()}
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

function SortableCard({
  card,
  requestId,
  assigneeName,
  noteCount,
  onExpand,
}: {
  card: Card;
  requestId?: string;
  assigneeName?: string;
  noteCount: number;
  onExpand: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CardTile card={card} requestId={requestId} assigneeName={assigneeName} noteCount={noteCount} onExpand={onExpand} />
    </div>
  );
}

function CardTile({
  card,
  requestId,
  dragging = false,
  assigneeName,
  noteCount = 0,
  onExpand,
}: {
  card: Card;
  requestId?: string;
  dragging?: boolean;
  assigneeName?: string;
  noteCount?: number;
  onExpand?: () => void;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid #3A2C68",
        borderRadius: 10,
        padding: 10,
        cursor: dragging ? "grabbing" : "grab",
        boxShadow: dragging ? "0 8px 20px rgba(0,0,0,0.4)" : "none",
        position: "relative",
      }}
    >
      {onExpand && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onExpand();
          }}
          title="Expand card"
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            background: "rgba(255,255,255,0.06)",
            border: "none",
            borderRadius: 6,
            width: 20,
            height: 20,
            fontSize: 11,
            color: "#9C8FD9",
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          ⤢
        </button>
      )}
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4, paddingRight: 20 }}>{card.title}</div>
      <div style={{ fontSize: 10, color: "#B5A8E8", marginBottom: 2 }}>
        👤 {assigneeName ?? "Unassigned"}
      </div>
      <div style={{ fontSize: 10, color: "#7A6FAE", display: "flex", alignItems: "center", gap: 8 }}>
        <span>⏱ {formatTicketAge(card.created_at)}</span>
        {noteCount > 0 && <span>💬 {noteCount}</span>}
      </div>
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

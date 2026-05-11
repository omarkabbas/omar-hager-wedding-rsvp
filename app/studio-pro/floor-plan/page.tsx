"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { supabase } from "@/lib/supabase";
import { DatabaseEnvironmentBadge } from "../DatabaseEnvironmentBadge";

type GuestResponse = {
  id: string;
  guest_name: string;
  invite_code: string;
  max_guests: number;
  confirmed_guests: number | null;
  attending: boolean | null;
  virtual_guest?: boolean | null;
};

type SeatingAssignment = {
  id: number;
  name: string;
  name_aliases?: string | null;
  invite_code?: string | null;
  table_number: number;
  guest_count?: number | null;
};

type SeatUnit = {
  key: string;
  inviteCode: string;
  householdName: string;
  label: string;
  seatNumber: number;
  assignmentId?: number;
  guestId?: string;
  tableNumber?: number;
};

type DragPayload =
  | { kind: "assigned"; assignmentId: number; inviteCode: string }
  | { kind: "unseated"; guestId: string; inviteCode: string };

type Toast = {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
};

type ConfirmDialogState = {
  title: string;
  message: string;
  actionLabel: string;
  actionTone?: "danger" | "default";
  onConfirm: () => Promise<void> | void;
};

type TablePosition = { x: number; y: number };
type FloorSize = { width: number; height: number };
type GuestTableShape = "round" | "square" | "rect";
type RoomObjectKind =
  | "round_table"
  | "square_table"
  | "rect_table"
  | "bar"
  | "cake"
  | "buffet"
  | "photo_booth"
  | "lounge"
  | "sofa"
  | "sweetheart_table"
  | "kosha_backdrop"
  | "floral_arch"
  | "welcome_sign"
  | "escort_cards"
  | "gift_table"
  | "dj_booth"
  | "dessert_table"
  | "coffee_station"
  | "cocktail_area"
  | "ceremony_chairs"
  | "aisle"
  | "greenery_wall"
  | "memory_table"
  | "kids_area"
  | "high_top"
  | "podium"
  | "custom";
type RoomObject = {
  id: string;
  kind: RoomObjectKind;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
type TableDragState = {
  tableNumber: number;
  offsetX: number;
  offsetY: number;
  previousLayout: FloorPlanLayout;
};
type StageDragState = {
  offsetX: number;
  offsetY: number;
  previousLayout: FloorPlanLayout;
};
type DanceFloorDragState = {
  offsetX: number;
  offsetY: number;
  previousLayout: FloorPlanLayout;
};
type FloorPanState = {
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
};
type RoomObjectDragState = {
  objectId: string;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  label: string;
  previousLayout: FloorPlanLayout;
};
type ResizeTarget = "stage" | "danceFloor" | { objectId: string };
type ResizeState = {
  target: ResizeTarget;
  startClientX: number;
  startClientY: number;
  startSize: FloorSize;
  previousLayout: FloorPlanLayout;
};

type FloorPlanLayoutTable = {
  x: number;
  y: number;
  capacity: number;
  shape?: GuestTableShape;
};

type FloorPlanLayout = {
  version: 1;
  canvas: {
    width: number;
    height?: number;
    leftPadding: number;
  };
  objects: {
    stage: TablePosition;
    danceFloor: TablePosition;
    stageSize?: FloorSize;
    danceFloorSize?: FloorSize;
    stageVisible?: boolean;
    danceFloorVisible?: boolean;
    monogram?: string;
    items?: RoomObject[];
  };
  tables: Record<string, FloorPlanLayoutTable>;
};

type LayoutStorageMode = "loading" | "database" | "browser";
type TableHealth = "empty" | "open" | "full" | "over";
type GuestFinderResult = {
  key: string;
  guestName: string;
  aliases: string[];
  inviteCode: string;
  tableNumber: number | null;
  seatCount: number;
  status: "Seated" | "Waiting";
  spotlightKey: string;
};

const FLOOR_LAYOUT_KEY = "studio_pro_seat_floor_layout_v1";
const EXTRA_TABLES_KEY = "studio_pro_seat_extra_tables_v1";
const TABLE_CAPACITIES_KEY = "studio_pro_seat_table_capacities_v1";
const TABLE_SHAPES_KEY = "studio_pro_seat_table_shapes_v1";
const FLOOR_CANVAS_KEY = "studio_pro_seat_floor_canvas_v1";
const FLOOR_AUTO_SAVE_KEY = "studio_pro_seat_floor_auto_save_v1";
const FLOOR_PLAN_LAYOUT_ID = "default";
const FLOOR_WIDTH = 1360;
const FLOOR_MIN_HEIGHT = 820;
const TABLE_SIZE = 250;
const TABLE_CENTER = TABLE_SIZE / 2;
const DANCE_FLOOR = { x: 540, y: 230, width: 280, height: 340 };
const STAGE_SIZE = { width: 340, height: 118 };
const DEFAULT_FLOOR_MONOGRAM = "O & H";
const FLOOR_EXPAND_STEP = 360;
const MIN_STAGE_SIZE = { width: 220, height: 88 };
const MIN_DANCE_FLOOR_SIZE = { width: 160, height: 140 };
const MIN_ROOM_OBJECT_SIZE = { width: 70, height: 58 };
const ROOM_OBJECT_PRESETS: Record<RoomObjectKind, { label: string; width: number; height: number }> = {
  round_table: { label: "Round Table", width: 150, height: 150 },
  square_table: { label: "Square Table", width: 140, height: 140 },
  rect_table: { label: "Rectangular Table", width: 210, height: 120 },
  bar: { label: "Bar", width: 170, height: 90 },
  cake: { label: "Cake", width: 115, height: 115 },
  buffet: { label: "Buffet", width: 190, height: 90 },
  photo_booth: { label: "Photo Booth", width: 150, height: 120 },
  lounge: { label: "Lounge Area", width: 230, height: 130 },
  sofa: { label: "Sofa", width: 190, height: 76 },
  sweetheart_table: { label: "Sweetheart Table", width: 180, height: 92 },
  kosha_backdrop: { label: "Kosha Backdrop", width: 260, height: 70 },
  floral_arch: { label: "Floral Arch", width: 150, height: 170 },
  welcome_sign: { label: "Welcome Sign", width: 96, height: 130 },
  escort_cards: { label: "Escort Cards", width: 170, height: 90 },
  gift_table: { label: "Gift Table", width: 150, height: 90 },
  dj_booth: { label: "DJ Booth", width: 190, height: 110 },
  dessert_table: { label: "Dessert Table", width: 180, height: 95 },
  coffee_station: { label: "Coffee Station", width: 150, height: 82 },
  cocktail_area: { label: "Cocktail Area", width: 220, height: 130 },
  ceremony_chairs: { label: "Ceremony Chairs", width: 220, height: 150 },
  aisle: { label: "Aisle", width: 92, height: 260 },
  greenery_wall: { label: "Greenery Wall", width: 230, height: 64 },
  memory_table: { label: "Memory Table", width: 150, height: 86 },
  kids_area: { label: "Kids Area", width: 190, height: 130 },
  high_top: { label: "High Top", width: 86, height: 86 },
  podium: { label: "Podium", width: 84, height: 74 },
  custom: { label: "Custom", width: 150, height: 100 },
};

const normalizeInviteCode = (value?: string | null) => (value || "").trim().toUpperCase();
const normalizeSeatName = (value?: string | null) => (value || "").trim().toLowerCase();
const parseNameAliases = (value?: string | null) =>
  (value || "")
    .split(",")
    .map((alias) => alias.trim())
    .filter(Boolean);
const getSeatUnitGroupKey = (unit: SeatUnit) => (unit.assignmentId ? `assignment:${unit.assignmentId}` : unit.key);
const getAssignmentSeatCount = (assignment: SeatingAssignment) => Math.max(1, assignment.guest_count || 1);
const isSameSeatingIdentity = (left: SeatingAssignment, right: SeatingAssignment) =>
  normalizeInviteCode(left.invite_code) === normalizeInviteCode(right.invite_code) &&
  normalizeSeatName(left.name) === normalizeSeatName(right.name);
const getGuestExpectedSeats = (guest: GuestResponse) =>
  guest.attending === true ? Math.max(1, guest.confirmed_guests || 1) : Math.max(1, guest.max_guests || 1);
const getTableHealth = (usedSeats: number, capacity: number): TableHealth => {
  if (usedSeats > capacity) return "over";
  if (usedSeats === 0) return "empty";
  if (usedSeats === capacity) return "full";
  return "open";
};
const getTableHealthLabel = (health: TableHealth, openSeats: number) => {
  if (health === "over") return "Over Capacity";
  if (health === "empty") return "Empty";
  if (health === "full") return "Full";
  return `${openSeats} Open`;
};
const TABLE_HEALTH_STYLES: Record<TableHealth, { badge: string; border: string; ring: string; text: string }> = {
  empty: {
    badge: "bg-stone-100 text-stone-600 ring-stone-200",
    border: "border-stone-300",
    ring: "",
    text: "text-stone-500",
  },
  open: {
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    border: "border-emerald-300",
    ring: "ring-emerald-100",
    text: "text-emerald-700",
  },
  full: {
    badge: "bg-sky-50 text-sky-700 ring-sky-100",
    border: "border-sky-300",
    ring: "ring-sky-100",
    text: "text-sky-700",
  },
  over: {
    badge: "bg-rose-50 text-rose-700 ring-rose-100",
    border: "border-rose-400",
    ring: "ring-rose-100",
    text: "text-rose-700",
  },
};

const getDefaultTablePosition = (index: number) => {
  const leftColumns = [90, 330];
  const rightColumns = [830, 1070];
  const side = index % 2 === 0 ? "left" : "right";
  const sideIndex = Math.floor(index / 2);
  const columns = side === "left" ? leftColumns : rightColumns;
  const x = columns[sideIndex % columns.length];
  const y = 95 + Math.floor(sideIndex / columns.length) * 285;
  return { x, y };
};

const getDefaultStagePosition = (leftPadding = 0) => ({
  x: DANCE_FLOOR.x + leftPadding - 30,
  y: 55,
});

const getDefaultDanceFloorPosition = (leftPadding = 0) => ({
  x: DANCE_FLOOR.x + leftPadding,
  y: DANCE_FLOOR.y,
});

const clampSize = (size: FloorSize, minSize: FloorSize) => ({
  width: Math.max(minSize.width, Math.min(520, size.width)),
  height: Math.max(minSize.height, Math.min(420, size.height)),
});

const getSeatPosition = (index: number, total: number) => {
  const angle = -Math.PI / 2 + (index / Math.max(1, total)) * Math.PI * 2;
  const radius = 108;
  return {
    left: TABLE_CENTER + Math.cos(angle) * radius,
    top: TABLE_CENTER + Math.sin(angle) * radius,
  };
};

const getGuestTableSize = (shape: GuestTableShape) => {
  if (shape === "rect") return { width: 150, height: 96 };
  if (shape === "square") return { width: 116, height: 116 };
  return { width: 128, height: 128 };
};

const getTableSeatPosition = (index: number, total: number, shape: GuestTableShape) => {
  if (shape === "round") return getSeatPosition(index, total);

  const size = getGuestTableSize(shape);
  const sideCounts = getTableSideCounts(total, shape);
  const seatGap = shape === "rect" ? 42 : 46;
  const topY = TABLE_CENTER - size.height / 2 - seatGap;
  const bottomY = TABLE_CENTER + size.height / 2 + seatGap;
  const leftX = TABLE_CENTER - size.width / 2 - seatGap;
  const rightX = TABLE_CENTER + size.width / 2 + seatGap;
  const horizontalSpan = size.width + (shape === "rect" ? 42 : 30);
  const verticalSpan = size.height + 22;
  const topStartX = TABLE_CENTER - horizontalSpan / 2;
  const leftStartY = TABLE_CENTER - verticalSpan / 2;

  let remainingIndex = index;
  const sideOrder: { side: "top" | "right" | "bottom" | "left"; count: number }[] = [
    { side: "top", count: sideCounts.top },
    { side: "right", count: sideCounts.right },
    { side: "bottom", count: sideCounts.bottom },
    { side: "left", count: sideCounts.left },
  ];

  for (const side of sideOrder) {
    if (remainingIndex >= side.count) {
      remainingIndex -= side.count;
      continue;
    }

    const ratio = (remainingIndex + 1) / (side.count + 1);
    if (side.side === "top") return { left: topStartX + horizontalSpan * ratio, top: topY };
    if (side.side === "right") return { left: rightX, top: leftStartY + verticalSpan * ratio };
    if (side.side === "bottom") return { left: topStartX + horizontalSpan * (1 - ratio), top: bottomY };
    return { left: leftX, top: leftStartY + verticalSpan * (1 - ratio) };
  }

  return { left: TABLE_CENTER, top: TABLE_CENTER };
};

const getTableSideCounts = (total: number, shape: GuestTableShape) => {
  const safeTotal = Math.max(1, total);
  if (safeTotal <= 4) {
    const sides = ["top", "right", "bottom", "left"] as const;
    return sides.reduce(
      (counts, side, index) => ({ ...counts, [side]: index < safeTotal ? 1 : 0 }),
      { top: 0, right: 0, bottom: 0, left: 0 },
    );
  }

  const weights = shape === "rect" ? { top: 1.45, right: 1, bottom: 1.45, left: 1 } : { top: 1, right: 1, bottom: 1, left: 1 };
  const sides = ["top", "right", "bottom", "left"] as const;
  const totalWeight = sides.reduce((sum, side) => sum + weights[side], 0);
  const rawCounts = sides.map((side) => ({ side, exact: (safeTotal * weights[side]) / totalWeight }));
  const counts = rawCounts.reduce(
    (nextCounts, item) => ({ ...nextCounts, [item.side]: Math.max(1, Math.floor(item.exact)) }),
    { top: 0, right: 0, bottom: 0, left: 0 },
  );

  let assigned = sides.reduce((sum, side) => sum + counts[side], 0);
  rawCounts
    .sort((left, right) => right.exact - Math.floor(right.exact) - (left.exact - Math.floor(left.exact)))
    .forEach(({ side }) => {
      if (assigned < safeTotal) {
        counts[side] += 1;
        assigned += 1;
      }
    });

  while (assigned > safeTotal) {
    const side = [...sides].sort((left, right) => counts[right] - counts[left])[0];
    if (counts[side] <= 1) break;
    counts[side] -= 1;
    assigned -= 1;
  }

  return counts;
};

const isTableObject = (kind: RoomObjectKind) => ["round_table", "square_table", "rect_table"].includes(kind);
const normalizeGuestTableShape = (shape?: string | null): GuestTableShape =>
  shape === "square" || shape === "rect" ? shape : "round";

const getSeatDisplayParts = (unit: SeatUnit, showGuestLabels: boolean) => {
  if (!showGuestLabels) return { primary: String(unit.seatNumber), code: unit.inviteCode };
  const nameParts = unit.householdName
    .split(/\s+/)
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean);
  const initials = nameParts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || unit.householdName.slice(0, 2).toUpperCase();
  return { primary: initials, code: unit.inviteCode };
};

const splitInviteCodeForSvg = (inviteCode: string) => inviteCode.match(/.{1,10}/g) || [inviteCode];

const escapeSvgText = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const escapeHtml = escapeSvgText;

const getFloorGridSvg = (width: number, height: number) => {
  const verticalLines = Array.from({ length: Math.ceil(width / 28) + 1 }, (_, index) => {
    const x = index * 28;
    return `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#eef2f7" stroke-width="1" />`;
  }).join("");
  const horizontalLines = Array.from({ length: Math.ceil(height / 28) + 1 }, (_, index) => {
    const y = index * 28;
    return `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#eef2f7" stroke-width="1" />`;
  }).join("");

  return verticalLines + horizontalLines;
};

export default function FloorPlanPage() {
  const [authorized, setAuthorized] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [responses, setResponses] = useState<GuestResponse[]>([]);
  const [seatingAssignments, setSeatingAssignments] = useState<SeatingAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [newTableNumber, setNewTableNumber] = useState<number | "">(1);
  const [newTableShape, setNewTableShape] = useState<GuestTableShape>("round");
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [tapSeatAction, setTapSeatAction] = useState<DragPayload | null>(null);
  const [activeTarget, setActiveTarget] = useState<number | "queue" | null>(null);
  const [tablePositions, setTablePositions] = useState<Record<number, TablePosition>>({});
  const [extraTableNumbers, setExtraTableNumbers] = useState<number[]>([]);
  const [tableCapacities, setTableCapacities] = useState<Record<number, number>>({});
  const [tableShapes, setTableShapes] = useState<Record<number, GuestTableShape>>({});
  const [floorZoom, setFloorZoom] = useState(1);
  const [printZoom, setPrintZoom] = useState(0.72);
  const [layoutLocked, setLayoutLocked] = useState(false);
  const [spotlightSearch, setSpotlightSearch] = useState("");
  const [spotlightTargetKey, setSpotlightTargetKey] = useState<string | null>(null);
  const [selectedTableNumber, setSelectedTableNumber] = useState<number | null>(null);
  const [showGuestLabels, setShowGuestLabels] = useState(true);
  const [tableDragState, setTableDragState] = useState<TableDragState | null>(null);
  const [stageDragState, setStageDragState] = useState<StageDragState | null>(null);
  const [danceFloorDragState, setDanceFloorDragState] = useState<DanceFloorDragState | null>(null);
  const [floorPanState, setFloorPanState] = useState<FloorPanState | null>(null);
  const [floorWidth, setFloorWidth] = useState(FLOOR_WIDTH);
  const [floorHeight, setFloorHeight] = useState(FLOOR_MIN_HEIGHT);
  const [floorLeftPadding, setFloorLeftPadding] = useState(0);
  const [stagePosition, setStagePosition] = useState<TablePosition>(() => getDefaultStagePosition());
  const [danceFloorPosition, setDanceFloorPosition] = useState<TablePosition>(() => getDefaultDanceFloorPosition());
  const [stageSize, setStageSize] = useState<FloorSize>(STAGE_SIZE);
  const [danceFloorSize, setDanceFloorSize] = useState<FloorSize>({ width: DANCE_FLOOR.width, height: DANCE_FLOOR.height });
  const [stageVisible, setStageVisible] = useState(true);
  const [danceFloorVisible, setDanceFloorVisible] = useState(true);
  const [floorMonogram, setFloorMonogram] = useState(DEFAULT_FLOOR_MONOGRAM);
  const [roomObjects, setRoomObjects] = useState<RoomObject[]>([]);
  const [roomObjectKind, setRoomObjectKind] = useState<RoomObjectKind>("round_table");
  const [roomObjectLabel, setRoomObjectLabel] = useState("");
  const [roomObjectDragState, setRoomObjectDragState] = useState<RoomObjectDragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [layoutStorageMode, setLayoutStorageMode] = useState<LayoutStorageMode>("loading");
  const [hasLoadedLayout, setHasLoadedLayout] = useState(false);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [layoutSaveMode, setLayoutSaveMode] = useState<"manual" | "auto" | null>(null);
  const [autoSaveLayout, setAutoSaveLayout] = useState(false);
  const [hasUnsavedLayoutChanges, setHasUnsavedLayoutChanges] = useState(false);
  const [layoutHistory, setLayoutHistory] = useState<FloorPlanLayout[]>([]);
  const [lastLayoutSavedAt, setLastLayoutSavedAt] = useState<Date | null>(null);
  const [busyKeys, setBusyKeys] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const floorScrollRef = useRef<HTMLElement | null>(null);
  const floorRef = useRef<HTMLDivElement | null>(null);
  const layoutSnapshotRef = useRef<string | null>(null);

  const showToast = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, tone: message.toLowerCase().includes("error") ? "error" : tone, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  const askConfirm = (dialog: ConfirmDialogState) => setConfirmDialog(dialog);

  const showLayoutUpdatedToast = useCallback(
    (message: string) => {
      setHasUnsavedLayoutChanges(true);
      showToast(autoSaveLayout ? `${message} Autosaving...` : `${message} Use Save Layout when ready.`, "success");
    },
    [autoSaveLayout, showToast],
  );

  const applyFloorPlanLayout = useCallback((layout: FloorPlanLayout, options: { markSaved?: boolean } = {}) => {
    if (options.markSaved !== false) {
      layoutSnapshotRef.current = JSON.stringify(layout);
      setHasUnsavedLayoutChanges(false);
    }
    const tableEntries = Object.entries(layout.tables || {})
      .map(([tableNumber, table]) => [Number(tableNumber), table] as const)
      .filter(([tableNumber]) => Number.isFinite(tableNumber) && tableNumber > 0);

    const nextPositions: Record<number, TablePosition> = {};
    const nextCapacities: Record<number, number> = {};
    const nextShapes: Record<number, GuestTableShape> = {};

    tableEntries.forEach(([tableNumber, table]) => {
      nextPositions[tableNumber] = {
        x: Math.max(0, table.x || 0),
        y: Math.max(0, table.y || 0),
      };
      nextCapacities[tableNumber] = Math.max(1, Math.min(24, table.capacity || 8));
      nextShapes[tableNumber] = normalizeGuestTableShape(table.shape);
    });

    const nextCanvas = layout.canvas || { width: FLOOR_WIDTH, height: FLOOR_MIN_HEIGHT, leftPadding: 0 };
    const nextObjects = layout.objects || {
      stage: getDefaultStagePosition(nextCanvas.leftPadding || 0),
      danceFloor: getDefaultDanceFloorPosition(nextCanvas.leftPadding || 0),
    };

    setTablePositions(nextPositions);
    setTableCapacities(nextCapacities);
    setTableShapes(nextShapes);
    setExtraTableNumbers(tableEntries.map(([tableNumber]) => tableNumber).sort((left, right) => left - right));
    setFloorWidth(Math.max(FLOOR_WIDTH, nextCanvas.width || FLOOR_WIDTH));
    setFloorHeight(Math.max(FLOOR_MIN_HEIGHT, nextCanvas.height || FLOOR_MIN_HEIGHT));
    setFloorLeftPadding(Math.max(0, nextCanvas.leftPadding || 0));
    setStagePosition(nextObjects.stage || getDefaultStagePosition(nextCanvas.leftPadding || 0));
    setDanceFloorPosition(nextObjects.danceFloor || getDefaultDanceFloorPosition(nextCanvas.leftPadding || 0));
    setStageSize(clampSize(nextObjects.stageSize || STAGE_SIZE, MIN_STAGE_SIZE));
    setDanceFloorSize(clampSize(nextObjects.danceFloorSize || { width: DANCE_FLOOR.width, height: DANCE_FLOOR.height }, MIN_DANCE_FLOOR_SIZE));
    setStageVisible(nextObjects.stageVisible !== false);
    setDanceFloorVisible(nextObjects.danceFloorVisible !== false);
    setFloorMonogram(typeof nextObjects.monogram === "string" ? nextObjects.monogram : DEFAULT_FLOOR_MONOGRAM);
    setRoomObjects(nextObjects.items || []);
  }, []);

  const loadBrowserLayoutBackup = useCallback(() => {
    try {
      const savedLayout = window.localStorage.getItem(FLOOR_LAYOUT_KEY);
      if (savedLayout) setTablePositions(JSON.parse(savedLayout) as Record<number, TablePosition>);

      const savedExtraTables = window.localStorage.getItem(EXTRA_TABLES_KEY);
      if (savedExtraTables) setExtraTableNumbers(JSON.parse(savedExtraTables) as number[]);

      const savedCapacities = window.localStorage.getItem(TABLE_CAPACITIES_KEY);
      if (savedCapacities) setTableCapacities(JSON.parse(savedCapacities) as Record<number, number>);

      const savedShapes = window.localStorage.getItem(TABLE_SHAPES_KEY);
      if (savedShapes) setTableShapes(JSON.parse(savedShapes) as Record<number, GuestTableShape>);

      const savedCanvas = window.localStorage.getItem(FLOOR_CANVAS_KEY);
      if (savedCanvas) {
        const parsedCanvas = JSON.parse(savedCanvas) as {
          width?: number;
          height?: number;
          leftPadding?: number;
          stagePosition?: TablePosition;
          danceFloorPosition?: TablePosition;
          stageSize?: FloorSize;
          danceFloorSize?: FloorSize;
          stageVisible?: boolean;
          danceFloorVisible?: boolean;
          floorMonogram?: string;
          roomObjects?: RoomObject[];
        };
        setFloorWidth(Math.max(FLOOR_WIDTH, parsedCanvas.width || FLOOR_WIDTH));
        setFloorHeight(Math.max(FLOOR_MIN_HEIGHT, parsedCanvas.height || FLOOR_MIN_HEIGHT));
        setFloorLeftPadding(Math.max(0, parsedCanvas.leftPadding || 0));
        if (parsedCanvas.stagePosition) setStagePosition(parsedCanvas.stagePosition);
        if (parsedCanvas.danceFloorPosition) setDanceFloorPosition(parsedCanvas.danceFloorPosition);
        if (parsedCanvas.stageSize) setStageSize(clampSize(parsedCanvas.stageSize, MIN_STAGE_SIZE));
        if (parsedCanvas.danceFloorSize) setDanceFloorSize(clampSize(parsedCanvas.danceFloorSize, MIN_DANCE_FLOOR_SIZE));
        if (typeof parsedCanvas.stageVisible === "boolean") setStageVisible(parsedCanvas.stageVisible);
        if (typeof parsedCanvas.danceFloorVisible === "boolean") setDanceFloorVisible(parsedCanvas.danceFloorVisible);
        if (typeof parsedCanvas.floorMonogram === "string") setFloorMonogram(parsedCanvas.floorMonogram);
        if (parsedCanvas.roomObjects) setRoomObjects(parsedCanvas.roomObjects);
      }

      return Boolean(savedLayout || savedExtraTables || savedCapacities || savedCanvas);
    } catch {
      window.localStorage.removeItem(FLOOR_LAYOUT_KEY);
      window.localStorage.removeItem(EXTRA_TABLES_KEY);
      window.localStorage.removeItem(TABLE_CAPACITIES_KEY);
      window.localStorage.removeItem(TABLE_SHAPES_KEY);
      window.localStorage.removeItem(FLOOR_CANVAS_KEY);
      return false;
    }
  }, []);

  const saveBrowserLayoutBackup = useCallback((layout: FloorPlanLayout) => {
    const tableEntries = Object.entries(layout.tables || {});
    window.localStorage.setItem(
      FLOOR_LAYOUT_KEY,
      JSON.stringify(
        Object.fromEntries(
          tableEntries.map(([tableNumber, table]) => [tableNumber, { x: table.x, y: table.y }]),
        ),
      ),
    );
    window.localStorage.setItem(EXTRA_TABLES_KEY, JSON.stringify(tableEntries.map(([tableNumber]) => Number(tableNumber)).filter(Boolean)));
    window.localStorage.setItem(
      TABLE_CAPACITIES_KEY,
      JSON.stringify(Object.fromEntries(tableEntries.map(([tableNumber, table]) => [tableNumber, table.capacity]))),
    );
    window.localStorage.setItem(
      TABLE_SHAPES_KEY,
      JSON.stringify(Object.fromEntries(tableEntries.map(([tableNumber, table]) => [tableNumber, normalizeGuestTableShape(table.shape)]))),
    );
    window.localStorage.setItem(
      FLOOR_CANVAS_KEY,
      JSON.stringify({
        width: layout.canvas.width,
        height: layout.canvas.height || FLOOR_MIN_HEIGHT,
        leftPadding: layout.canvas.leftPadding,
        stagePosition: layout.objects.stage,
        danceFloorPosition: layout.objects.danceFloor,
        stageSize: layout.objects.stageSize || STAGE_SIZE,
        danceFloorSize: layout.objects.danceFloorSize || { width: DANCE_FLOOR.width, height: DANCE_FLOOR.height },
        stageVisible: layout.objects.stageVisible !== false,
        danceFloorVisible: layout.objects.danceFloorVisible !== false,
        floorMonogram: layout.objects.monogram ?? DEFAULT_FLOOR_MONOGRAM,
        roomObjects: layout.objects.items || [],
      }),
    );
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const [rsvpResult, seatingResult] = await Promise.all([
      supabase.from("rsvp_list").select("*").order("guest_name", { ascending: true }),
      supabase.from("seating").select("*").order("table_number", { ascending: true }).order("name", { ascending: true }),
    ]);

    let hasError = false;
    if (rsvpResult.error) {
      hasError = true;
      showToast(rsvpResult.error.message, "error");
    } else {
      setResponses((rsvpResult.data || []) as GuestResponse[]);
    }

    if (seatingResult.error) {
      hasError = true;
      showToast(seatingResult.error.message, "error");
    } else {
      setSeatingAssignments((seatingResult.data || []) as SeatingAssignment[]);
    }

    setIsLoading(false);
    setLastRefreshedAt(new Date());
    return !hasError;
  }, [showToast]);

  useEffect(() => {
    window.queueMicrotask(() => {
      setAuthorized(window.sessionStorage.getItem("isLoggedIn") === "true");
      setIsCheckingSession(false);
      loadBrowserLayoutBackup();
      setAutoSaveLayout(window.localStorage.getItem(FLOOR_AUTO_SAVE_KEY) === "true");
    });
  }, [loadBrowserLayoutBackup]);

  useEffect(() => {
    window.localStorage.setItem(FLOOR_AUTO_SAVE_KEY, autoSaveLayout ? "true" : "false");
  }, [autoSaveLayout]);

  const shiftFloorContents = useCallback(
    ({ x = 0, y = 0, excludeRoomObjectId }: { x?: number; y?: number; excludeRoomObjectId?: string } = {}) => {
      if (x === 0 && y === 0) return;

      setStagePosition((prev) => ({ x: prev.x + x, y: prev.y + y }));
      setDanceFloorPosition((prev) => ({ x: prev.x + x, y: prev.y + y }));
      setRoomObjects((prev) =>
        prev.map((object) =>
          object.id === excludeRoomObjectId ? object : { ...object, x: object.x + x, y: object.y + y },
        ),
      );
      setTablePositions((prev) =>
        Object.fromEntries(Object.entries(prev).map(([table, position]) => [table, { x: position.x + x, y: position.y + y }])),
      );
    },
    [],
  );

  useEffect(() => {
    if (!tableDragState) return;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = floorRef.current?.getBoundingClientRect();
      if (!rect) return;

      let nextX = (event.clientX - rect.left) / floorZoom - tableDragState.offsetX;
      let nextY = (event.clientY - rect.top) / floorZoom - tableDragState.offsetY;

      if (nextX < 24) {
        setFloorWidth((prev) => prev + FLOOR_EXPAND_STEP);
        setFloorLeftPadding((prev) => prev + FLOOR_EXPAND_STEP);
        setTableDragState((prev) =>
          prev && prev.tableNumber === tableDragState.tableNumber ? { ...prev, offsetX: prev.offsetX - FLOOR_EXPAND_STEP } : prev,
        );
        shiftFloorContents({ x: FLOOR_EXPAND_STEP });
        nextX += FLOOR_EXPAND_STEP;
      }

      if (nextY < 24) {
        setFloorHeight((prev) => prev + FLOOR_EXPAND_STEP);
        setTableDragState((prev) =>
          prev && prev.tableNumber === tableDragState.tableNumber ? { ...prev, offsetY: prev.offsetY - FLOOR_EXPAND_STEP } : prev,
        );
        shiftFloorContents({ y: FLOOR_EXPAND_STEP });
        nextY += FLOOR_EXPAND_STEP;
      }

      if (nextX > floorWidth - TABLE_SIZE - 24) {
        setFloorWidth((prev) => prev + FLOOR_EXPAND_STEP);
      }
      if (nextY > floorHeight - TABLE_SIZE - 24) {
        setFloorHeight((prev) => prev + FLOOR_EXPAND_STEP);
      }

      nextX = Math.max(0, nextX);
      nextY = Math.max(0, nextY);

      setTablePositions((prev) => ({
        ...prev,
        [tableDragState.tableNumber]: { x: nextX, y: nextY },
      }));
    };

    const handlePointerUp = () => {
      setLayoutHistory((prev) => [tableDragState.previousLayout, ...prev].slice(0, 25));
      setTableDragState(null);
      showLayoutUpdatedToast(`Table ${tableDragState.tableNumber} layout updated.`);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [floorHeight, floorWidth, floorZoom, shiftFloorContents, showLayoutUpdatedToast, tableDragState]);

  useEffect(() => {
    if (!stageDragState) return;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = floorRef.current?.getBoundingClientRect();
      if (!rect) return;

      let nextX = (event.clientX - rect.left) / floorZoom - stageDragState.offsetX;
      let nextY = (event.clientY - rect.top) / floorZoom - stageDragState.offsetY;

      if (nextX < 24) {
        setFloorWidth((prev) => prev + FLOOR_EXPAND_STEP);
        setFloorLeftPadding((prev) => prev + FLOOR_EXPAND_STEP);
        setStageDragState((prev) => (prev ? { ...prev, offsetX: prev.offsetX - FLOOR_EXPAND_STEP } : prev));
        shiftFloorContents({ x: FLOOR_EXPAND_STEP });
        nextX += FLOOR_EXPAND_STEP;
      }

      if (nextY < 24) {
        setFloorHeight((prev) => prev + FLOOR_EXPAND_STEP);
        setStageDragState((prev) => (prev ? { ...prev, offsetY: prev.offsetY - FLOOR_EXPAND_STEP } : prev));
        shiftFloorContents({ y: FLOOR_EXPAND_STEP });
        nextY += FLOOR_EXPAND_STEP;
      }

      if (nextX > floorWidth - stageSize.width - 24) {
        setFloorWidth((prev) => prev + FLOOR_EXPAND_STEP);
      }
      if (nextY > floorHeight - stageSize.height - 24) {
        setFloorHeight((prev) => prev + FLOOR_EXPAND_STEP);
      }

      setStagePosition({ x: Math.max(0, nextX), y: Math.max(0, nextY) });
    };

    const handlePointerUp = () => {
      setLayoutHistory((prev) => [stageDragState.previousLayout, ...prev].slice(0, 25));
      setStageDragState(null);
      showLayoutUpdatedToast("Stage layout updated.");
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [floorHeight, floorWidth, floorZoom, shiftFloorContents, showLayoutUpdatedToast, stageDragState, stageSize.height, stageSize.width]);

  useEffect(() => {
    if (!danceFloorDragState) return;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = floorRef.current?.getBoundingClientRect();
      if (!rect) return;

      let nextX = (event.clientX - rect.left) / floorZoom - danceFloorDragState.offsetX;
      let nextY = (event.clientY - rect.top) / floorZoom - danceFloorDragState.offsetY;

      if (nextX < 24) {
        setFloorWidth((prev) => prev + FLOOR_EXPAND_STEP);
        setFloorLeftPadding((prev) => prev + FLOOR_EXPAND_STEP);
        setDanceFloorDragState((prev) => (prev ? { ...prev, offsetX: prev.offsetX - FLOOR_EXPAND_STEP } : prev));
        shiftFloorContents({ x: FLOOR_EXPAND_STEP });
        nextX += FLOOR_EXPAND_STEP;
      }

      if (nextY < 24) {
        setFloorHeight((prev) => prev + FLOOR_EXPAND_STEP);
        setDanceFloorDragState((prev) => (prev ? { ...prev, offsetY: prev.offsetY - FLOOR_EXPAND_STEP } : prev));
        shiftFloorContents({ y: FLOOR_EXPAND_STEP });
        nextY += FLOOR_EXPAND_STEP;
      }

      if (nextX > floorWidth - danceFloorSize.width - 24) {
        setFloorWidth((prev) => prev + FLOOR_EXPAND_STEP);
      }
      if (nextY > floorHeight - danceFloorSize.height - 24) {
        setFloorHeight((prev) => prev + FLOOR_EXPAND_STEP);
      }

      setDanceFloorPosition({ x: Math.max(0, nextX), y: Math.max(0, nextY) });
    };

    const handlePointerUp = () => {
      setLayoutHistory((prev) => [danceFloorDragState.previousLayout, ...prev].slice(0, 25));
      setDanceFloorDragState(null);
      showLayoutUpdatedToast("Dance floor layout updated.");
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [danceFloorDragState, danceFloorSize.height, danceFloorSize.width, floorHeight, floorWidth, floorZoom, shiftFloorContents, showLayoutUpdatedToast]);

  useEffect(() => {
    if (!floorPanState) return;

    const handlePointerMove = (event: PointerEvent) => {
      const scrollElement = floorScrollRef.current;
      if (!scrollElement) return;
      scrollElement.scrollLeft = floorPanState.scrollLeft - (event.clientX - floorPanState.startX);
      scrollElement.scrollTop = floorPanState.scrollTop - (event.clientY - floorPanState.startY);
    };

    const handlePointerUp = () => {
      setFloorPanState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [floorPanState]);

  useEffect(() => {
    if (!roomObjectDragState) return;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = floorRef.current?.getBoundingClientRect();
      if (!rect) return;

      let nextX = (event.clientX - rect.left) / floorZoom - roomObjectDragState.offsetX;
      let nextY = (event.clientY - rect.top) / floorZoom - roomObjectDragState.offsetY;

      if (nextX < 24) {
        setFloorWidth((prev) => prev + FLOOR_EXPAND_STEP);
        setFloorLeftPadding((prev) => prev + FLOOR_EXPAND_STEP);
        setRoomObjectDragState((prev) => (prev ? { ...prev, offsetX: prev.offsetX - FLOOR_EXPAND_STEP } : prev));
        shiftFloorContents({ x: FLOOR_EXPAND_STEP, excludeRoomObjectId: roomObjectDragState.objectId });
        nextX += FLOOR_EXPAND_STEP;
      }

      if (nextY < 24) {
        setFloorHeight((prev) => prev + FLOOR_EXPAND_STEP);
        setRoomObjectDragState((prev) => (prev ? { ...prev, offsetY: prev.offsetY - FLOOR_EXPAND_STEP } : prev));
        shiftFloorContents({ y: FLOOR_EXPAND_STEP, excludeRoomObjectId: roomObjectDragState.objectId });
        nextY += FLOOR_EXPAND_STEP;
      }

      if (nextX > floorWidth - roomObjectDragState.width - 24) {
        setFloorWidth((prev) => prev + FLOOR_EXPAND_STEP);
      }
      if (nextY > floorHeight - roomObjectDragState.height - 24) {
        setFloorHeight((prev) => prev + FLOOR_EXPAND_STEP);
      }

      setRoomObjects((prev) =>
        prev.map((object) =>
          object.id === roomObjectDragState.objectId ? { ...object, x: Math.max(0, nextX), y: Math.max(0, nextY) } : object,
        ),
      );
    };

    const handlePointerUp = () => {
      setLayoutHistory((prev) => [roomObjectDragState.previousLayout, ...prev].slice(0, 25));
      setRoomObjectDragState(null);
      showLayoutUpdatedToast(`${roomObjectDragState.label} moved.`);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [floorHeight, floorWidth, floorZoom, roomObjectDragState, shiftFloorContents, showLayoutUpdatedToast]);

  useEffect(() => {
    if (!resizeState) return;

    const handlePointerMove = (event: PointerEvent) => {
      const deltaX = (event.clientX - resizeState.startClientX) / floorZoom;
      const deltaY = (event.clientY - resizeState.startClientY) / floorZoom;
      const nextSize = {
        width: resizeState.startSize.width + deltaX,
        height: resizeState.startSize.height + deltaY,
      };

      if (resizeState.target === "stage") {
        const clampedSize = clampSize(nextSize, MIN_STAGE_SIZE);
        if (stagePosition.x + clampedSize.width > floorWidth - 24) setFloorWidth((prev) => prev + FLOOR_EXPAND_STEP);
        if (stagePosition.y + clampedSize.height > floorHeight - 24) setFloorHeight((prev) => prev + FLOOR_EXPAND_STEP);
        setStageSize(clampedSize);
        return;
      }

      if (resizeState.target === "danceFloor") {
        const clampedSize = clampSize(nextSize, MIN_DANCE_FLOOR_SIZE);
        if (danceFloorPosition.x + clampedSize.width > floorWidth - 24) setFloorWidth((prev) => prev + FLOOR_EXPAND_STEP);
        if (danceFloorPosition.y + clampedSize.height > floorHeight - 24) setFloorHeight((prev) => prev + FLOOR_EXPAND_STEP);
        setDanceFloorSize(clampedSize);
        return;
      }

      if (typeof resizeState.target === "string") return;

      const target = resizeState.target;
      const targetObject = roomObjects.find((object) => object.id === target.objectId);
      const clampedSize = clampSize(nextSize, MIN_ROOM_OBJECT_SIZE);
      if (targetObject) {
        if (targetObject.x + clampedSize.width > floorWidth - 24) setFloorWidth((prev) => prev + FLOOR_EXPAND_STEP);
        if (targetObject.y + clampedSize.height > floorHeight - 24) setFloorHeight((prev) => prev + FLOOR_EXPAND_STEP);
      }
      setRoomObjects((prev) =>
        prev.map((object) =>
          object.id === target.objectId ? { ...object, ...clampedSize } : object,
        ),
      );
    };

    const handlePointerUp = () => {
      setLayoutHistory((prev) => [resizeState.previousLayout, ...prev].slice(0, 25));
      setResizeState(null);
      showLayoutUpdatedToast("Object resized.");
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [danceFloorPosition.x, danceFloorPosition.y, floorHeight, floorWidth, floorZoom, resizeState, roomObjects, showLayoutUpdatedToast, stagePosition.x, stagePosition.y]);

  const seatingDisplayNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    seatingAssignments.forEach((assignment) => {
      const inviteCode = normalizeInviteCode(assignment.invite_code);
      const seatingName = assignment.name.trim();
      if (inviteCode && seatingName && !map.has(inviteCode)) map.set(inviteCode, seatingName);
    });
    return map;
  }, [seatingAssignments]);

  const assignedSeatUnits = useMemo(() => {
    const counters = new Map<number, number>();

    return seatingAssignments.flatMap((assignment) => {
      const inviteCode = normalizeInviteCode(assignment.invite_code);
      if (!inviteCode) return [];

      const householdName = assignment.name.trim() || "Assigned guest";
      const seats = getAssignmentSeatCount(assignment);

      return Array.from({ length: seats }, (_, index) => {
        const seatNumber = (counters.get(assignment.id) || 0) + 1;
        counters.set(assignment.id, seatNumber);

        return {
          key: `assigned-${assignment.id}-${index}`,
          inviteCode,
          householdName,
          label: seats === 1 && seatNumber === 1 ? householdName : `${householdName} ${seatNumber}`,
          seatNumber,
          assignmentId: assignment.id,
          tableNumber: assignment.table_number,
        };
      });
    });
  }, [seatingAssignments]);

  const assignedSeatsByCode = useMemo(() => {
    const map = new Map<string, number>();
    assignedSeatUnits.forEach((unit) => {
      map.set(unit.inviteCode, (map.get(unit.inviteCode) || 0) + 1);
    });
    return map;
  }, [assignedSeatUnits]);

  const unseatedUnits = useMemo(() => {
    const query = search.trim().toLowerCase();

    return responses
      .filter((guest) => guest.attending === true && guest.virtual_guest !== true)
      .flatMap((guest) => {
        const inviteCode = normalizeInviteCode(guest.invite_code);
        if (!inviteCode) return [];

        const expectedSeats = getGuestExpectedSeats(guest);
        const assignedSeats = assignedSeatsByCode.get(inviteCode) || 0;
        const remainingSeats = Math.max(0, expectedSeats - assignedSeats);

        if (remainingSeats === 0) return [];

        return Array.from({ length: remainingSeats }, (_, index) => {
          const seatNumber = assignedSeats + index + 1;
          const householdName = seatingDisplayNameByCode.get(inviteCode) || guest.guest_name;
          return {
            key: `unseated-${guest.id}-${index}`,
            inviteCode,
            householdName,
            label: expectedSeats === 1 ? householdName : `${householdName} ${seatNumber}`,
            seatNumber,
            guestId: guest.id,
          };
        });
      })
      .filter((unit) => {
        if (!query) return true;
        return [unit.householdName, unit.inviteCode, unit.label].some((value) => value.toLowerCase().includes(query));
      })
      .sort((left, right) => left.householdName.localeCompare(right.householdName) || left.seatNumber - right.seatNumber);
  }, [assignedSeatsByCode, responses, search, seatingDisplayNameByCode]);

  const tapSeatActionLabel = useMemo(() => {
    if (!tapSeatAction) return "";

    if (tapSeatAction.kind === "unseated") {
      const guest = responses.find((item) => item.id === tapSeatAction.guestId);
      return unseatedUnits.find((unit) => unit.guestId === tapSeatAction.guestId)?.householdName || guest?.guest_name || "Selected guest";
    }

    const assignment = seatingAssignments.find((item) => item.id === tapSeatAction.assignmentId);
    return assignment?.name || "Selected guest";
  }, [responses, seatingAssignments, tapSeatAction, unseatedUnits]);

  const tableNumbers = useMemo(() => {
    const existing = seatingAssignments.map((assignment) => assignment.table_number);
    return Array.from(new Set([...existing, ...extraTableNumbers])).sort((left, right) => left - right);
  }, [extraTableNumbers, seatingAssignments]);

  const tableModels = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tableNumbers.map((tableNumber, index) => {
      const units = assignedSeatUnits
        .filter((unit) => unit.tableNumber === tableNumber)
        .filter((unit) => {
          if (!query) return true;
          return [unit.householdName, unit.inviteCode, unit.label, String(tableNumber)].some((value) => value.toLowerCase().includes(query));
        });

      const capacity = Math.max(tableCapacities[tableNumber] || 8, units.length, 1);
      const openSeats = Math.max(0, capacity - units.length);
      const health = getTableHealth(units.length, capacity);

      return {
        tableNumber,
        units,
        capacity,
        openSeats,
        health,
        position: tablePositions[tableNumber] || { ...getDefaultTablePosition(index), x: getDefaultTablePosition(index).x + floorLeftPadding },
        shape: tableShapes[tableNumber] || "round",
      };
    });
  }, [assignedSeatUnits, floorLeftPadding, search, tableCapacities, tableNumbers, tablePositions, tableShapes]);

  const floorSize = useMemo(() => {
    const visibleStageBounds = stageVisible ? [stagePosition.x + stageSize.width + 120] : [];
    const visibleDanceBounds = danceFloorVisible ? [danceFloorPosition.x + danceFloorSize.width + 120] : [];
    const visibleStageHeightBounds = stageVisible ? [stagePosition.y + stageSize.height + 100] : [];
    const visibleDanceHeightBounds = danceFloorVisible ? [danceFloorPosition.y + danceFloorSize.height + 120] : [];

    return {
      width: Math.max(
        FLOOR_WIDTH,
        floorWidth,
        ...visibleDanceBounds,
        ...visibleStageBounds,
        ...tableModels.map((table) => table.position.x + TABLE_SIZE + 120),
        ...roomObjects.map((object) => object.x + object.width + 120),
      ),
      height: Math.max(
        FLOOR_MIN_HEIGHT,
        floorHeight,
        ...visibleDanceHeightBounds,
        ...visibleStageHeightBounds,
        ...tableModels.map((table) => table.position.y + TABLE_SIZE + 80),
        ...roomObjects.map((object) => object.y + object.height + 100),
      ),
    };
  }, [danceFloorPosition.x, danceFloorPosition.y, danceFloorSize.height, danceFloorSize.width, danceFloorVisible, floorHeight, floorWidth, roomObjects, stagePosition.x, stagePosition.y, stageSize.height, stageSize.width, stageVisible, tableModels]);

  const stats = useMemo(
    () => ({
      tables: tableNumbers.filter((table) => assignedSeatUnits.some((unit) => unit.tableNumber === table)).length,
      seatedGuests: assignedSeatUnits.length,
      waitingGuests: unseatedUnits.length,
      openSeats: tableModels.reduce((sum, table) => sum + table.openSeats, 0),
      emptyTables: tableModels.filter((table) => table.health === "empty").length,
      openTables: tableModels.filter((table) => table.health === "open").length,
      fullTables: tableModels.filter((table) => table.health === "full").length,
    }),
    [assignedSeatUnits, tableModels, tableNumbers, unseatedUnits.length],
  );

  const selectedTable = useMemo(
    () => tableModels.find((table) => table.tableNumber === selectedTableNumber) ?? null,
    [selectedTableNumber, tableModels],
  );

  const guestFinderResults = useMemo<GuestFinderResult[]>(() => {
    const query = spotlightSearch.trim().toLowerCase();
    if (!query) return [];

    const assignedResults = seatingAssignments.flatMap<GuestFinderResult>((assignment) => {
      const inviteCode = normalizeInviteCode(assignment.invite_code);
      if (!inviteCode) return [];

      const aliases = parseNameAliases(assignment.name_aliases);
      const guestName = assignment.name.trim() || "Assigned guest";
      const searchableValues = [
        guestName,
        inviteCode,
        String(assignment.table_number),
        `table ${assignment.table_number}`,
        ...aliases,
      ];
      const matchesAssignment = searchableValues.some((value) => value.toLowerCase().includes(query));
      if (!matchesAssignment) return [];

      return [
        {
          key: `assignment:${assignment.id}`,
          guestName,
          aliases,
          inviteCode,
          tableNumber: assignment.table_number,
          seatCount: Math.max(1, assignment.guest_count || 1),
          status: "Seated" as const,
          spotlightKey: `assignment:${assignment.id}`,
        },
      ];
    });

    const waitingResults = responses.flatMap<GuestFinderResult>((guest) => {
      const inviteCode = normalizeInviteCode(guest.invite_code);
      if (!inviteCode) return [];

      const seatingDisplayName = seatingDisplayNameByCode.get(inviteCode);
      const displayName = seatingDisplayName || guest.guest_name;
      const searchValues = seatingDisplayName ? [seatingDisplayName, inviteCode] : [guest.guest_name, inviteCode];
      const matchesGuest = searchValues.some((value) => value.toLowerCase().includes(query));
      if (!matchesGuest) return [];

      const expectedSeats = guest.attending === true && guest.virtual_guest !== true ? getGuestExpectedSeats(guest) : 0;
      const assignedSeats = assignedSeatsByCode.get(inviteCode) || 0;
      const waitingSeats = Math.max(0, expectedSeats - assignedSeats);
      if (waitingSeats === 0) return [];

      return [
        {
          key: `${guest.id}-waiting`,
          guestName: displayName,
          aliases: [],
          inviteCode,
          tableNumber: null,
          seatCount: waitingSeats,
          status: "Waiting" as const,
          spotlightKey: `waiting:${inviteCode}`,
        },
      ];
    });

    return [...assignedResults, ...waitingResults]
      .sort((left, right) => {
        if (left.status !== right.status) return left.status === "Seated" ? -1 : 1;
        return left.guestName.localeCompare(right.guestName) || (left.tableNumber || 9999) - (right.tableNumber || 9999);
      })
      .slice(0, 12);
  }, [assignedSeatsByCode, responses, seatingAssignments, seatingDisplayNameByCode, spotlightSearch]);

  const allWaitingGuests = useMemo(
    () =>
      responses
        .filter((guest) => guest.attending === true && guest.virtual_guest !== true)
        .flatMap((guest) => {
          const inviteCode = normalizeInviteCode(guest.invite_code);
          if (!inviteCode) return [];
          const expectedSeats = getGuestExpectedSeats(guest);
          const assignedSeats = assignedSeatsByCode.get(inviteCode) || 0;
          const waitingSeats = Math.max(0, expectedSeats - assignedSeats);
          if (waitingSeats === 0) return [];
          return [{ guestName: seatingDisplayNameByCode.get(inviteCode) || guest.guest_name, inviteCode, waitingSeats }];
        })
        .sort((left, right) => left.guestName.localeCompare(right.guestName)),
    [assignedSeatsByCode, responses, seatingDisplayNameByCode],
  );

  const focusTableOnFloor = useCallback(
    (tableNumber: number, spotlightKey?: string | null) => {
      const table = tableModels.find((item) => item.tableNumber === tableNumber);
      if (!table) return;

      setSelectedTableNumber(tableNumber);
      setSpotlightTargetKey(spotlightKey || null);

      window.requestAnimationFrame(() => {
        floorScrollRef.current?.scrollTo({
          left: Math.max(0, (table.position.x - 120) * floorZoom),
          top: Math.max(0, (table.position.y - 120) * floorZoom),
          behavior: "smooth",
        });
      });
    },
    [floorZoom, tableModels],
  );

  const focusGuestResult = (result: GuestFinderResult) => {
    setSpotlightTargetKey(result.spotlightKey);

    if (result.tableNumber === null) {
      setSearch(result.inviteCode);
      showToast(`${result.guestName} is still waiting for a seat.`, "info");
      return;
    }

    focusTableOnFloor(result.tableNumber, result.spotlightKey);
  };

  const buildFloorPlanLayout = useCallback(
    (): FloorPlanLayout => ({
      version: 1,
      canvas: {
        width: floorSize.width,
        height: floorSize.height,
        leftPadding: floorLeftPadding,
      },
      objects: {
        stage: stagePosition,
        danceFloor: danceFloorPosition,
        stageSize,
        danceFloorSize,
        stageVisible,
        danceFloorVisible,
        monogram: floorMonogram,
        items: roomObjects,
      },
      tables: Object.fromEntries(
        tableModels.map((table) => [
          String(table.tableNumber),
          {
            x: table.position.x,
            y: table.position.y,
            capacity: table.capacity,
            shape: table.shape,
          },
        ]),
      ),
    }),
    [danceFloorPosition, danceFloorSize, danceFloorVisible, floorLeftPadding, floorMonogram, floorSize.height, floorSize.width, roomObjects, stagePosition, stageSize, stageVisible, tableModels],
  );

  const fetchFloorPlanLayout = useCallback(async () => {
    const { data, error } = await supabase
      .from("floor_plan_layouts")
      .select("layout")
      .eq("id", FLOOR_PLAN_LAYOUT_ID)
      .maybeSingle();

    if (error) {
      setLayoutStorageMode("browser");
      setHasLoadedLayout(true);
      showToast("Saved floor plans are not set up yet. Layout changes will stay on this device for now.", "info");
      return false;
    }

    setLayoutStorageMode("database");
    if (data?.layout) applyFloorPlanLayout(data.layout as FloorPlanLayout);
    setHasLoadedLayout(true);
    return true;
  }, [applyFloorPlanLayout, showToast]);

  const refreshFloorPlan = useCallback(async () => {
    setIsRefreshing(true);
    const [didRefreshData, didRefreshLayout] = await Promise.all([fetchData(), fetchFloorPlanLayout()]);
    setIsRefreshing(false);

    if (didRefreshData && didRefreshLayout) {
      showToast("Guest list and floor layout refreshed.", "success");
    } else if (didRefreshData) {
      showToast("Guest list refreshed. The floor layout stayed as saved on this device.", "info");
    }
  }, [fetchData, fetchFloorPlanLayout, showToast]);

  const saveFloorPlanLayout = useCallback(
    async ({ mode = "manual" }: { mode?: "manual" | "auto" } = {}) => {
      const layout = buildFloorPlanLayout();
      const serializedLayout = JSON.stringify(layout);
      saveBrowserLayoutBackup(layout);
      const isAutoSave = mode === "auto";

      if (serializedLayout === layoutSnapshotRef.current) {
        setLastLayoutSavedAt(new Date());
        setHasUnsavedLayoutChanges(false);
        if (!isAutoSave) showToast("Layout is already saved.", "info");
        return;
      }

      if (layoutStorageMode !== "database") {
        layoutSnapshotRef.current = serializedLayout;
        setLastLayoutSavedAt(new Date());
        setHasUnsavedLayoutChanges(false);
        showToast(
          isAutoSave
            ? "Layout autosaved on this device."
            : "Layout saved on this device.",
          "info",
        );
        return;
      }

      setIsSavingLayout(true);
      setLayoutSaveMode(mode);
      const { error } = await supabase.from("floor_plan_layouts").upsert(
        {
          id: FLOOR_PLAN_LAYOUT_ID,
          layout,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      setIsSavingLayout(false);
      setLayoutSaveMode(null);

      if (error) {
        setLayoutStorageMode("browser");
        setHasUnsavedLayoutChanges(true);
        showToast(`Floor layout could not be saved. ${error.message}`, "error");
        return;
      }

      layoutSnapshotRef.current = serializedLayout;
      setHasUnsavedLayoutChanges(false);
      setLastLayoutSavedAt(new Date());
      showToast(isAutoSave ? "Layout autosaved." : "Floor plan layout saved.", "success");
    },
    [buildFloorPlanLayout, layoutStorageMode, saveBrowserLayoutBackup, showToast],
  );

  const pushLayoutUndo = useCallback((layout: FloorPlanLayout) => {
    const serializedLayout = JSON.stringify(layout);
    setLayoutHistory((prev) => {
      if (prev[0] && JSON.stringify(prev[0]) === serializedLayout) return prev;
      return [layout, ...prev].slice(0, 25);
    });
  }, []);

  const undoLastLayoutChange = useCallback(() => {
    const previousLayout = layoutHistory[0];
    if (!previousLayout) {
      showToast("No layout change to undo.", "info");
      return;
    }

    setLayoutHistory((prev) => prev.slice(1));
    applyFloorPlanLayout(previousLayout, { markSaved: false });
    setHasUnsavedLayoutChanges(true);
    showToast(autoSaveLayout ? "Layout undone. Autosave will save it shortly." : "Layout undone. Use Save Layout when you are ready.", "success");
  }, [applyFloorPlanLayout, autoSaveLayout, layoutHistory, showToast]);

  useEffect(() => {
    if (!authorized) return;
    window.queueMicrotask(() => {
      void fetchData();
      void fetchFloorPlanLayout();
    });

    const channel = supabase
      .channel("seat_management_floor_plan")
      .on("postgres_changes", { event: "*", schema: "public", table: "rsvp_list" }, () => void fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "seating" }, () => void fetchData())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "floor_plan_layouts", filter: `id=eq.${FLOOR_PLAN_LAYOUT_ID}` },
        (payload) => {
          const nextLayout = (payload.new as { layout?: FloorPlanLayout } | null)?.layout;
          if (nextLayout) applyFloorPlanLayout(nextLayout);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [applyFloorPlanLayout, authorized, fetchData, fetchFloorPlanLayout]);

  useEffect(() => {
    if (!authorized || !hasLoadedLayout || !autoSaveLayout || !hasUnsavedLayoutChanges) return;
    const timeoutId = window.setTimeout(() => {
      void saveFloorPlanLayout({ mode: "auto" });
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [
    autoSaveLayout,
    authorized,
    danceFloorPosition,
    danceFloorSize,
    danceFloorVisible,
    extraTableNumbers,
    floorLeftPadding,
    floorMonogram,
    floorHeight,
    floorWidth,
    hasLoadedLayout,
    hasUnsavedLayoutChanges,
    saveFloorPlanLayout,
    stagePosition,
    stageSize,
    stageVisible,
    roomObjects,
    tableCapacities,
    tableShapes,
    tablePositions,
  ]);

  const setBusy = (key: string, busy: boolean) => {
    setBusyKeys((prev) => (busy ? Array.from(new Set([...prev, key])) : prev.filter((item) => item !== key)));
  };

  const clearGuestTableLayout = useCallback((tableNumber: number) => {
    setExtraTableNumbers((prev) => prev.filter((item) => item !== tableNumber));
    setTablePositions((prev) => {
      const next = { ...prev };
      delete next[tableNumber];
      return next;
    });
    setTableCapacities((prev) => {
      const next = { ...prev };
      delete next[tableNumber];
      return next;
    });
    setTableShapes((prev) => {
      const next = { ...prev };
      delete next[tableNumber];
      return next;
    });
  }, []);

  const addGuestTable = () => {
    if (newTableNumber === "") return;
    if (tableNumbers.includes(newTableNumber)) {
      showToast(`Table ${newTableNumber} is already on the floor plan.`, "info");
      return;
    }

    pushLayoutUndo(buildFloorPlanLayout());
    setExtraTableNumbers((prev) => Array.from(new Set([...prev, newTableNumber])).sort((left, right) => left - right));
    const defaultPosition = getDefaultTablePosition(tableNumbers.length);
    setTablePositions((prev) => ({
      ...prev,
      [newTableNumber]: prev[newTableNumber] || { ...defaultPosition, x: defaultPosition.x + floorLeftPadding },
    }));
    setTableShapes((prev) => ({ ...prev, [newTableNumber]: newTableShape }));
    showLayoutUpdatedToast(`Table ${newTableNumber} added to the floor plan.`);
  };

  const removeGuestTable = (tableNumber: number) => {
    const table = tableModels.find((item) => item.tableNumber === tableNumber);
    const seatedCount = table?.units.length || 0;

    askConfirm({
      title: `Remove Table ${tableNumber}?`,
      message:
        seatedCount > 0
          ? `Remove table ${tableNumber} and move ${seatedCount} seated guest${seatedCount === 1 ? "" : "s"} back to Pending Seats?`
          : `Remove empty table ${tableNumber} from the floor plan?`,
      actionLabel: seatedCount > 0 ? "Remove Table & Unseat Guests" : "Remove Table",
      actionTone: "danger",
      onConfirm: async () => {
        pushLayoutUndo(buildFloorPlanLayout());

        if (seatedCount > 0) {
          const busyKey = `table:${tableNumber}`;
          setBusy(busyKey, true);
          const result = await supabase.from("seating").delete().eq("table_number", tableNumber);
          setBusy(busyKey, false);

          if (result.error) {
            showToast(result.error.message, "error");
            return;
          }

          void fetchData();
        }

        clearGuestTableLayout(tableNumber);
        showLayoutUpdatedToast(`Table ${tableNumber} removed.`);
      },
    });
  };

  const resetTableLayout = () => {
    askConfirm({
      title: "Reset Layout?",
      message: "This resets table positions, floor elements, the center logo text, and added room objects. It will not change where guests are seated.",
      actionLabel: "Reset Layout",
      onConfirm: () => {
        pushLayoutUndo(buildFloorPlanLayout());
        setTablePositions({});
        setTableShapes({});
        setFloorWidth(FLOOR_WIDTH);
        setFloorHeight(FLOOR_MIN_HEIGHT);
        setFloorLeftPadding(0);
        setStagePosition(getDefaultStagePosition());
        setDanceFloorPosition(getDefaultDanceFloorPosition());
        setStageSize(STAGE_SIZE);
        setDanceFloorSize({ width: DANCE_FLOOR.width, height: DANCE_FLOOR.height });
        setStageVisible(true);
        setDanceFloorVisible(true);
        setFloorMonogram(DEFAULT_FLOOR_MONOGRAM);
        setRoomObjects([]);
        showLayoutUpdatedToast("Table layout reset.");
      },
    });
  };

  const getLayoutBounds = () => {
    const bounds = [
      ...(stageVisible ? [{ x: stagePosition.x, y: stagePosition.y, width: stageSize.width, height: stageSize.height }] : []),
      ...(danceFloorVisible ? [{ x: danceFloorPosition.x, y: danceFloorPosition.y, width: danceFloorSize.width, height: danceFloorSize.height }] : []),
      ...tableModels.map((table) => ({ x: table.position.x, y: table.position.y, width: TABLE_SIZE, height: TABLE_SIZE })),
      ...roomObjects.map((object) => ({ x: object.x, y: object.y, width: object.width, height: object.height })),
    ];

    return bounds.reduce(
      (nextBounds, item) => ({
        minX: Math.min(nextBounds.minX, item.x),
        minY: Math.min(nextBounds.minY, item.y),
        maxX: Math.max(nextBounds.maxX, item.x + item.width),
        maxY: Math.max(nextBounds.maxY, item.y + item.height),
      }),
      { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: 0, maxY: 0 },
    );
  };

  const fitGridToLayout = () => {
    const bounds = getLayoutBounds();
    if (!Number.isFinite(bounds.minX)) return;

    const margin = 96;
    const shiftX = Math.max(0, bounds.minX - margin);
    const shiftY = Math.max(0, bounds.minY - margin);
    const nextWidth = Math.max(FLOOR_WIDTH, bounds.maxX - shiftX + margin);
    const nextHeight = Math.max(FLOOR_MIN_HEIGHT, bounds.maxY - shiftY + margin);

    pushLayoutUndo(buildFloorPlanLayout());
    if (shiftX > 0 || shiftY > 0) {
      if (stageVisible) {
        setStagePosition((prev) => ({ x: Math.max(margin, prev.x - shiftX), y: Math.max(margin, prev.y - shiftY) }));
      }
      if (danceFloorVisible) {
        setDanceFloorPosition((prev) => ({ x: Math.max(margin, prev.x - shiftX), y: Math.max(margin, prev.y - shiftY) }));
      }
      setRoomObjects((prev) =>
        prev.map((object) => ({ ...object, x: Math.max(margin, object.x - shiftX), y: Math.max(margin, object.y - shiftY) })),
      );
      setTablePositions((prev) =>
        Object.fromEntries(
          Object.entries(prev).map(([table, position]) => [
            table,
            { x: Math.max(margin, position.x - shiftX), y: Math.max(margin, position.y - shiftY) },
          ]),
        ),
      );
    }

    setFloorLeftPadding((prev) => Math.max(0, prev - shiftX));
    setFloorWidth(nextWidth);
    setFloorHeight(nextHeight);
    showLayoutUpdatedToast("Grid fitted around the current layout.");
  };

  const updateFloorMonogram = (value: string) => {
    setFloorMonogram(value);
    setHasUnsavedLayoutChanges(true);
  };

  const addStage = () => {
    if (layoutLocked) {
      showToast("Layout is locked. Unlock it before changing room elements.", "info");
      return;
    }
    if (stageVisible) return;
    pushLayoutUndo(buildFloorPlanLayout());
    setStageVisible(true);
    setStagePosition((prev) => prev || getDefaultStagePosition(floorLeftPadding));
    showLayoutUpdatedToast("Stage / Kosha added.");
  };

  const addDanceFloor = () => {
    if (layoutLocked) {
      showToast("Layout is locked. Unlock it before changing room elements.", "info");
      return;
    }
    if (danceFloorVisible) return;
    pushLayoutUndo(buildFloorPlanLayout());
    setDanceFloorVisible(true);
    setDanceFloorPosition((prev) => prev || getDefaultDanceFloorPosition(floorLeftPadding));
    showLayoutUpdatedToast("Dance floor added.");
  };

  const removeStage = () => {
    if (layoutLocked) {
      showToast("Layout is locked. Unlock it before changing room elements.", "info");
      return;
    }
    askConfirm({
      title: "Remove Stage / Kosha?",
      message: "Remove Stage / Kosha from the floor plan? You can add it back from the left panel.",
      actionLabel: "Remove Stage / Kosha",
      actionTone: "danger",
      onConfirm: () => {
        pushLayoutUndo(buildFloorPlanLayout());
        setStageVisible(false);
        showLayoutUpdatedToast("Stage / Kosha removed.");
      },
    });
  };

  const removeDanceFloor = () => {
    if (layoutLocked) {
      showToast("Layout is locked. Unlock it before changing room elements.", "info");
      return;
    }
    askConfirm({
      title: "Remove Dance Floor?",
      message: "Remove the dance floor from the floor plan? You can add it back from the left panel.",
      actionLabel: "Remove Dance Floor",
      actionTone: "danger",
      onConfirm: () => {
        pushLayoutUndo(buildFloorPlanLayout());
        setDanceFloorVisible(false);
        showLayoutUpdatedToast("Dance floor removed.");
      },
    });
  };

  const addGridSpace = () => {
    pushLayoutUndo(buildFloorPlanLayout());
    setFloorWidth((prev) => prev + FLOOR_EXPAND_STEP);
    setFloorHeight((prev) => prev + FLOOR_EXPAND_STEP);
    showLayoutUpdatedToast("More grid space added.");
  };

  const addRoomObject = () => {
    if (layoutLocked) {
      showToast("Layout is locked. Unlock it before adding room objects.", "info");
      return;
    }
    const preset = ROOM_OBJECT_PRESETS[roomObjectKind];
    const label = roomObjectLabel.trim() || preset.label;
    const nextObject: RoomObject = {
      id: `room-object-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      kind: roomObjectKind,
      label,
      x: floorLeftPadding + 90 + (roomObjects.length % 2) * 190,
      y: 610 + Math.floor(roomObjects.length / 2) * 150,
      width: preset.width,
      height: preset.height,
    };

    pushLayoutUndo(buildFloorPlanLayout());
    setRoomObjects((prev) => [...prev, nextObject]);
    setRoomObjectLabel("");
    showLayoutUpdatedToast(`${label} added to the floor plan.`);
  };

  const removeRoomObject = (objectId: string) => {
    if (layoutLocked) {
      showToast("Layout is locked. Unlock it before removing room objects.", "info");
      return;
    }
    const object = roomObjects.find((item) => item.id === objectId);
    if (!object) return;
    askConfirm({
      title: "Remove Object?",
      message: `Remove ${object.label} from the floor plan?`,
      actionLabel: "Remove Object",
      actionTone: "danger",
      onConfirm: () => {
        pushLayoutUndo(buildFloorPlanLayout());
        setRoomObjects((prev) => prev.filter((item) => item.id !== objectId));
        showLayoutUpdatedToast(`${object.label} removed.`);
      },
    });
  };

  const buildFloorPlanSvg = useCallback(() => {
    const monogramText = floorMonogram.trim();
    const stageMonogramSvg = monogramText
      ? `<text x="${stagePosition.x + stageSize.width / 2}" y="${stagePosition.y + Math.max(64, stageSize.height * 0.72)}" text-anchor="middle" font-family="Georgia, serif" font-size="34" fill="#44403c">${escapeSvgText(monogramText)}</text>`
      : "";
    const danceFloorMonogramSvg = monogramText
      ? `<text x="${danceFloorPosition.x + danceFloorSize.width / 2}" y="${danceFloorPosition.y + danceFloorSize.height / 2 + 31}" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="#44403c">${escapeSvgText(monogramText)}</text>`
      : "";
    const stageSvg = stageVisible
      ? `<g><rect x="${stagePosition.x}" y="${stagePosition.y}" width="${stageSize.width}" height="${stageSize.height}" rx="10" fill="#fafaf9" stroke="#78716c" stroke-width="2" /><text x="${stagePosition.x + stageSize.width / 2}" y="${stagePosition.y + Math.max(32, stageSize.height * 0.38)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#78716c" letter-spacing="3">STAGE / KOSHA</text>${stageMonogramSvg}</g>`
      : "";
    const danceFloorSvg = danceFloorVisible
      ? `<rect x="${danceFloorPosition.x}" y="${danceFloorPosition.y}" width="${danceFloorSize.width}" height="${danceFloorSize.height}" fill="#ffffffee" stroke="#d6d3d1" stroke-width="2" stroke-dasharray="9 7" /><text x="${danceFloorPosition.x + danceFloorSize.width / 2}" y="${danceFloorPosition.y + danceFloorSize.height / 2 - 12}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#78716c" letter-spacing="3">DANCE FLOOR</text>${danceFloorMonogramSvg}`
      : "";
    const roomObjectSvg = roomObjects
      .map((object) => {
        const isRound = object.kind === "round_table" || object.kind === "cake";
        const shape = isRound
          ? `<ellipse cx="${object.x + object.width / 2}" cy="${object.y + object.height / 2}" rx="${object.width / 2}" ry="${object.height / 2}" fill="#ffffff" stroke="#a8a29e" stroke-width="1.5" />`
          : `<rect x="${object.x}" y="${object.y}" width="${object.width}" height="${object.height}" rx="${object.kind === "square_table" ? 8 : 4}" fill="#ffffff" stroke="#a8a29e" stroke-width="1.5" />`;
        return `<g>${shape}<text x="${object.x + object.width / 2}" y="${object.y + object.height / 2 + 4}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#57534e">${escapeSvgText(object.label)}</text></g>`;
      })
      .join("");
    const tableSvg = tableModels
      .map((table) => {
        const seats = Array.from({ length: table.capacity }, (_, index) => table.units[index] || null);
        const seatSvg = seats
          .map((unit, index) => {
            const seatPosition = getTableSeatPosition(index, table.capacity, table.shape);
            const centerX = table.position.x + seatPosition.left;
            const centerY = table.position.y + seatPosition.top;
            const labelParts = unit ? getSeatDisplayParts(unit, showGuestLabels) : null;
            const labelLines = labelParts ? [labelParts.primary, ...splitInviteCodeForSvg(labelParts.code)] : [];
            const labelSvg = unit
              ? labelLines
                  .map(
                    (line, lineIndex) =>
                      `<text x="${centerX}" y="${centerY - 9 + lineIndex * 10}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${lineIndex === 0 ? "10" : "7"}" font-weight="700" fill="#44403c">${escapeSvgText(line)}</text>`,
                  )
                  .join("")
              : `<text x="${centerX}" y="${centerY + 4}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#a8a29e">+</text>`;

            return `<g><circle cx="${centerX}" cy="${centerY}" r="32" fill="${unit ? "#ffffff" : "#ffffffcc"}" stroke="${unit ? "#57534e" : "#d6d3d1"}" stroke-width="1.5" stroke-dasharray="${unit ? "0" : "5 4"}" />${labelSvg}</g>`;
          })
          .join("");

        const centerX = table.position.x + TABLE_CENTER;
        const centerY = table.position.y + TABLE_CENTER;

        const tableSize = getGuestTableSize(table.shape);
        const tableX = centerX - tableSize.width / 2;
        const tableY = centerY - tableSize.height / 2;
        const tableShapeSvg =
          table.shape === "round"
            ? `<circle cx="${centerX}" cy="${centerY}" r="64" fill="#ffffff" stroke="#a8a29e" stroke-width="1.5" />`
            : `<rect x="${tableX}" y="${tableY}" width="${tableSize.width}" height="${tableSize.height}" rx="${table.shape === "square" ? 8 : 12}" fill="#ffffff" stroke="#a8a29e" stroke-width="1.5" />`;

        return `<g>${tableShapeSvg}<text x="${centerX}" y="${centerY - 17}" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="700" fill="#a8a29e" letter-spacing="2">TABLE</text><text x="${centerX}" y="${centerY + 17}" text-anchor="middle" font-family="Georgia, serif" font-size="34" fill="#1c1917">${table.tableNumber}</text><text x="${centerX}" y="${centerY + 38}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#a8a29e">${table.units.length}/${table.capacity} seats</text>${seatSvg}</g>`;
      })
      .join("");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${floorSize.width}" height="${floorSize.height}" viewBox="0 0 ${floorSize.width} ${floorSize.height}"><rect width="100%" height="100%" fill="#ffffff" />${getFloorGridSvg(floorSize.width, floorSize.height)}${stageSvg}${danceFloorSvg}${roomObjectSvg}${tableSvg}</svg>`;
    return svg;
  }, [danceFloorPosition.x, danceFloorPosition.y, danceFloorSize.height, danceFloorSize.width, danceFloorVisible, floorMonogram, floorSize.height, floorSize.width, roomObjects, showGuestLabels, stagePosition.x, stagePosition.y, stageSize.height, stageSize.width, stageVisible, tableModels]);

  const captureFloorPlan = useCallback(async () => {
    const svg = buildFloorPlanSvg();
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();

    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Unable to render floor plan."));
        image.src = url;
      });
    } catch {
      URL.revokeObjectURL(url);
      showToast("Unable to capture the floor plan.", "error");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = floorSize.width;
    canvas.height = floorSize.height;
    const context = canvas.getContext("2d");
    if (!context) {
      URL.revokeObjectURL(url);
      showToast("Capture is not supported in this browser.", "error");
      return;
    }

    context.drawImage(image, 0, 0);
    URL.revokeObjectURL(url);

    const pngUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = pngUrl;
    link.download = "omar-hager-floor-plan.png";
    link.click();
    showToast("Floor plan captured.", "success");
  }, [buildFloorPlanSvg, floorSize.height, floorSize.width, showToast]);

  const buildTableListHtml = useCallback(() => {
    const tableSections = [...tableModels]
      .sort((left, right) => left.tableNumber - right.tableNumber)
      .map((table) => {
        const groupedGuests = Array.from(
          table.units.reduce((map, unit) => {
            const groupKey = getSeatUnitGroupKey(unit);
            const existing = map.get(groupKey);
            if (existing) {
              existing.count += 1;
              return map;
            }

            map.set(groupKey, {
              householdName: unit.householdName,
              inviteCode: unit.inviteCode,
              count: 1,
            });
            return map;
          }, new Map<string, { householdName: string; inviteCode: string; count: number }>()),
        ).map(([, guest]) => guest);
        const openSeats = Math.max(0, table.capacity - table.units.length);
        const tableStatus = table.units.length === 0 ? "Empty" : openSeats === 0 ? "Full" : `${openSeats} open seat${openSeats === 1 ? "" : "s"}`;
        const guestRows =
          groupedGuests.length > 0
            ? groupedGuests
                .map(
                  (guest) => `<li>
                    <div>
                      <strong>${escapeHtml(guest.householdName)}</strong>
                      <span>${escapeHtml(guest.inviteCode)}</span>
                    </div>
                    <b>${guest.count} seat${guest.count === 1 ? "" : "s"}</b>
                  </li>`,
                )
                .join("")
            : `<li class="empty-row">No guests assigned</li>`;

        return `<section class="table-card">
          <div class="table-card-header">
            <div>
              <p>Table</p>
              <h2>${table.tableNumber}</h2>
            </div>
            <span>${table.units.length}/${table.capacity} seats · ${tableStatus}</span>
          </div>
          <ol>${guestRows}</ol>
        </section>`;
      })
      .join("");

    const waitingRows =
      allWaitingGuests.length > 0
        ? allWaitingGuests
            .map(
              (guest) => `<li>
                <div>
                  <strong>${escapeHtml(guest.guestName)}</strong>
                  <span>${escapeHtml(guest.inviteCode)}</span>
                </div>
                <b>${guest.waitingSeats} seat${guest.waitingSeats === 1 ? "" : "s"}</b>
              </li>`,
            )
            .join("")
        : `<li class="empty-row">No attending guests are waiting for seats.</li>`;

    return `${tableSections}<section class="table-card waiting-card">
      <div class="table-card-header">
        <div>
          <p>Final Check</p>
          <h2>Guests Waiting For Seats</h2>
        </div>
        <span>${allWaitingGuests.length} invitation${allWaitingGuests.length === 1 ? "" : "s"}</span>
      </div>
      <ol>${waitingRows}</ol>
    </section>`;
  }, [allWaitingGuests, tableModels]);

  const buildTableGuestNameListHtml = useCallback(() => {
    const tables = [...tableModels].sort((left, right) => left.tableNumber - right.tableNumber);
    const assignmentById = new Map(seatingAssignments.map((assignment) => [assignment.id, assignment]));

    if (tables.length === 0) {
      return `<section class="empty-state">
        <h2>No tables yet</h2>
        <p>Add guest tables before printing the table guest list.</p>
      </section>`;
    }

    return tables
      .map((table) => {
        const guests = Array.from(
          table.units.reduce((map, unit) => {
            const groupKey = getSeatUnitGroupKey(unit);
            if (!map.has(groupKey)) {
              const assignment = unit.assignmentId ? assignmentById.get(unit.assignmentId) : null;
              map.set(groupKey, {
                householdName: unit.householdName,
                aliases: new Set(parseNameAliases(assignment?.name_aliases)),
              });
            } else {
              const assignment = unit.assignmentId ? assignmentById.get(unit.assignmentId) : null;
              parseNameAliases(assignment?.name_aliases).forEach((alias) => map.get(groupKey)?.aliases.add(alias));
            }
            return map;
          }, new Map<string, { householdName: string; aliases: Set<string> }>()),
        )
          .map(([, guest]) => ({
            householdName: guest.householdName,
            aliases: Array.from(guest.aliases).sort((left, right) => left.localeCompare(right)),
          }))
          .sort((left, right) => left.householdName.localeCompare(right.householdName));

        const guestRows =
          guests.length > 0
            ? guests
                .map(
                  (guest) => `<li>
                    <strong>${escapeHtml(guest.householdName)}</strong>
                    ${
                      guest.aliases.length > 0
                        ? `<span class="alias-line">Aliases: ${guest.aliases.map((alias) => escapeHtml(alias)).join(", ")}</span>`
                        : ""
                    }
                  </li>`,
                )
                .join("")
            : `<li class="empty-row">No guests assigned</li>`;

        return `<section class="table-name-card">
          <h2>Table ${table.tableNumber}</h2>
          <ol>${guestRows}</ol>
        </section>`;
      })
      .join("");
  }, [seatingAssignments, tableModels]);

  const openPrintableFloorPlan = useCallback(
    ({ title, subtitle, includeTableList }: { title: string; subtitle: string; includeTableList: boolean }) => {
      const previewWindow = window.open("", "_blank");
      if (!previewWindow) {
        showToast("Allow pop-ups to open the printable floor plan.", "error");
        return;
      }

      const svg = buildFloorPlanSvg();
      const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
      const fitLetterLandscape = Math.min(1, 980 / floorSize.width, 720 / floorSize.height);
      const fitLetterPortrait = Math.min(1, 740 / floorSize.width, 980 / floorSize.height);
      const tableListHtml = includeTableList ? buildTableListHtml() : "";

      previewWindow.opener = null;
      previewWindow.document.write(`<!doctype html>
<html>
  <head>
    <title>${escapeHtml(title)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        margin: 0;
        background: #f6f8fb;
        color: #1c1917;
        font-family: Arial, sans-serif;
      }
      header {
        position: sticky;
        top: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 14px 18px;
        border-bottom: 1px solid #e7e5e4;
        background: rgba(255, 255, 255, 0.96);
      }
      h1, h2 {
        margin: 0;
        font-family: Georgia, serif;
        font-weight: 500;
      }
      h1 { font-size: 24px; }
      p {
        margin: 4px 0 0;
        color: #78716c;
        font-size: 12px;
      }
      button, a {
        border: 1px solid #d6d3d1;
        border-radius: 999px;
        background: #fff;
        color: #44403c;
        cursor: pointer;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.13em;
        padding: 10px 14px;
        text-decoration: none;
        text-transform: uppercase;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
      }
      main {
        padding: 20px;
        overflow: auto;
      }
      .floor-sheet {
        display: inline-block;
        background: #fff;
        box-shadow: 0 18px 45px rgba(28, 25, 23, 0.12);
      }
      img {
        display: block;
        max-width: none;
        width: ${Math.round(floorSize.width * printZoom)}px;
        height: ${Math.round(floorSize.height * printZoom)}px;
        background: #fff;
      }
      .table-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 12px;
        margin-top: 20px;
      }
      .table-card {
        break-inside: avoid;
        border: 1px solid #e7e5e4;
        border-radius: 18px;
        background: #fff;
        padding: 14px;
      }
      .table-card-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        border-bottom: 1px solid #f5f5f4;
        padding-bottom: 10px;
      }
      .table-card-header p {
        margin: 0 0 2px;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }
      .table-card-header h2 {
        font-size: 28px;
      }
      .table-card-header span {
        color: #78716c;
        font-size: 12px;
        font-weight: 700;
        text-align: right;
      }
      ol {
        list-style: none;
        margin: 10px 0 0;
        padding: 0;
      }
      li {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        border-bottom: 1px solid #f5f5f4;
        padding: 8px 0;
      }
      li:last-child { border-bottom: 0; }
      li strong {
        display: block;
        font-family: Georgia, serif;
        font-size: 16px;
        font-weight: 500;
      }
      li span {
        display: block;
        margin-top: 2px;
        color: #78716c;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      li b {
        color: #57534e;
        font-size: 12px;
        white-space: nowrap;
      }
      .empty-row {
        color: #78716c;
        font-size: 13px;
      }
      @media print {
        @page { size: landscape; margin: 0.35in; }
        body { background: #fff; }
        header { display: none; }
        main { padding: 0; overflow: visible; }
        .floor-sheet { box-shadow: none; }
        .table-list { grid-template-columns: repeat(2, 1fr); }
      }
    </style>
  </head>
  <body>
    <header>
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <div class="actions">
        <button onclick="setZoom(${fitLetterLandscape.toFixed(3)})">Fit Landscape</button>
        <button onclick="setZoom(${fitLetterPortrait.toFixed(3)})">Fit Portrait</button>
        <button onclick="setZoom(0.5)">50%</button>
        <button onclick="setZoom(0.75)">75%</button>
        <button onclick="setZoom(1)">100%</button>
        <a href="${svgUrl}" download="omar-hager-floor-plan.svg">Download SVG</a>
        <button onclick="window.print()">Print</button>
      </div>
    </header>
    <main>
      <section class="floor-sheet">
        <img id="floor-plan-image" src="${svgUrl}" alt="Omar and Hager floor plan" />
      </section>
      ${includeTableList ? `<section class="table-list">${tableListHtml}</section>` : ""}
    </main>
    <script>
      const sourceWidth = ${floorSize.width};
      const sourceHeight = ${floorSize.height};
      function setZoom(zoom) {
        const image = document.getElementById('floor-plan-image');
        image.style.width = Math.round(sourceWidth * zoom) + 'px';
        image.style.height = Math.round(sourceHeight * zoom) + 'px';
      }
    </script>
  </body>
</html>`);
      previewWindow.document.close();
      showToast(`${title} opened.`, "success");
    },
    [buildFloorPlanSvg, buildTableListHtml, floorSize.height, floorSize.width, printZoom, showToast],
  );

  const openPrintPacket = useCallback(() => {
    openPrintableFloorPlan({
      title: "Planner Print Packet",
      subtitle: "Floor plan, table-by-table guest list, and guests still waiting for seats.",
      includeTableList: true,
    });
  }, [openPrintableFloorPlan]);

  const openVendorView = useCallback(() => {
    openPrintableFloorPlan({
      title: "Read-Only Vendor Floor Plan",
      subtitle: "Non-editable floor plan and table list for venue, catering, and planner staff.",
      includeTableList: true,
    });
  }, [openPrintableFloorPlan]);

  const openFloorPlanPreview = useCallback(() => {
    openPrintableFloorPlan({
      title: "Floor Plan Preview",
      subtitle: "Read-only floor plan with print zoom controls.",
      includeTableList: false,
    });
  }, [openPrintableFloorPlan]);

  const openTableGuestListPrint = useCallback(() => {
    const previewWindow = window.open("", "_blank");
    if (!previewWindow) {
      showToast("Allow pop-ups to open the table guest list.", "error");
      return;
    }

    const tableListHtml = buildTableGuestNameListHtml();
    const seatedGuestTotal = tableModels.reduce((total, table) => {
      const uniqueGuests = new Set(table.units.map((unit) => getSeatUnitGroupKey(unit)));
      return total + uniqueGuests.size;
    }, 0);

    previewWindow.opener = null;
    previewWindow.document.write(`<!doctype html>
<html>
  <head>
    <title>Table Guest List</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        margin: 0;
        background: #f6f8fb;
        color: #1c1917;
        font-family: Arial, sans-serif;
      }
      header {
        position: sticky;
        top: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        border-bottom: 1px solid #e7e5e4;
        background: rgba(255, 255, 255, 0.96);
        padding: 14px 18px;
      }
      h1, h2 {
        margin: 0;
        font-family: Georgia, serif;
        font-weight: 500;
      }
      h1 { font-size: 24px; }
      p {
        margin: 4px 0 0;
        color: #78716c;
        font-size: 12px;
      }
      button {
        border: 1px solid #d6d3d1;
        border-radius: 999px;
        background: #fff;
        color: #44403c;
        cursor: pointer;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.13em;
        padding: 10px 14px;
        text-transform: uppercase;
      }
      main {
        padding: 18px;
      }
      .table-name-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
        gap: 10px;
        align-items: start;
      }
      .table-name-card {
        break-inside: avoid;
        border: 1px solid #e7e5e4;
        border-radius: 14px;
        background: #fff;
        padding: 10px 12px 12px;
      }
      .table-name-card h2 {
        border-bottom: 1px solid #f5f5f4;
        color: #4e5e72;
        font-size: 18px;
        padding-bottom: 7px;
      }
      ol {
        list-style-position: inside;
        margin: 8px 0 0;
        padding: 0;
      }
      li {
        border-bottom: 1px solid #f5f5f4;
        font-family: Georgia, serif;
        font-size: 14px;
        line-height: 1.25;
        padding: 5px 0;
      }
      li strong {
        display: block;
        font-weight: 500;
      }
      .alias-line {
        display: block;
        margin-top: 2px;
        color: #78716c;
        font-family: Arial, sans-serif;
        font-size: 10px;
      }
      li:last-child { border-bottom: 0; }
      .empty-row {
        color: #a8a29e;
        font-family: Arial, sans-serif;
        font-size: 12px;
        font-style: italic;
        list-style: none;
      }
      .empty-state {
        border: 1px solid #e7e5e4;
        border-radius: 18px;
        background: #fff;
        padding: 18px;
        text-align: center;
      }
      @media print {
        @page { size: letter portrait; margin: 0.35in; }
        body { background: #fff; }
        header { display: none; }
        main { padding: 0; }
        .table-name-list {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .table-name-card {
          border-radius: 0;
          padding: 8px 10px;
        }
        .table-name-card h2 {
          font-size: 16px;
          padding-bottom: 5px;
        }
        li {
          font-size: 12px;
          padding: 3px 0;
        }
      }
    </style>
  </head>
  <body>
    <header>
      <div>
        <h1>Table Guest List</h1>
        <p>${tableModels.length} table${tableModels.length === 1 ? "" : "s"} · ${seatedGuestTotal} guest name${seatedGuestTotal === 1 ? "" : "s"}</p>
      </div>
      <button onclick="window.print()">Print</button>
    </header>
    <main>
      <section class="table-name-list">${tableListHtml}</section>
    </main>
  </body>
</html>`);
    previewWindow.document.close();
    showToast("Table guest list opened.", "success");
  }, [buildTableGuestNameListHtml, showToast, tableModels]);

  const updateTableCapacity = (tableNumber: number, nextCapacity: number) => {
    const seatedCount = tableModels.find((table) => table.tableNumber === tableNumber)?.units.length || 0;
    const normalizedCapacity = Math.max(seatedCount, Math.min(24, nextCapacity));
    if (normalizedCapacity === tableCapacities[tableNumber]) return;
    pushLayoutUndo(buildFloorPlanLayout());
    setTableCapacities((prev) => ({ ...prev, [tableNumber]: normalizedCapacity }));
    showLayoutUpdatedToast(`Table ${tableNumber} seat count updated.`);
  };

  const updateTableShape = (tableNumber: number, nextShape: GuestTableShape) => {
    if ((tableShapes[tableNumber] || "round") === nextShape) return;
    pushLayoutUndo(buildFloorPlanLayout());
    setTableShapes((prev) => ({ ...prev, [tableNumber]: nextShape }));
    showLayoutUpdatedToast(`Table ${tableNumber} shape updated.`);
  };

  const startTableDrag = (tableNumber: number, event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("[data-seat-token='true']")) return;
    if (layoutLocked) {
      showToast("Layout is locked. Unlock it before moving tables.", "info");
      return;
    }
    const rect = floorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const currentPosition =
      tablePositions[tableNumber] ||
      tableModels.find((table) => table.tableNumber === tableNumber)?.position ||
      getDefaultTablePosition(0);

    event.preventDefault();
    setTableDragState({
      tableNumber,
      offsetX: (event.clientX - rect.left) / floorZoom - currentPosition.x,
      offsetY: (event.clientY - rect.top) / floorZoom - currentPosition.y,
      previousLayout: buildFloorPlanLayout(),
    });
  };

  const startStageDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("[data-object-control='true']")) return;
    if (layoutLocked) {
      showToast("Layout is locked. Unlock it before moving room elements.", "info");
      return;
    }
    const rect = floorRef.current?.getBoundingClientRect();
    if (!rect) return;

    event.preventDefault();
    event.stopPropagation();
    setStageDragState({
      offsetX: (event.clientX - rect.left) / floorZoom - stagePosition.x,
      offsetY: (event.clientY - rect.top) / floorZoom - stagePosition.y,
      previousLayout: buildFloorPlanLayout(),
    });
  };

  const startDanceFloorDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("[data-object-control='true']")) return;
    if (layoutLocked) {
      showToast("Layout is locked. Unlock it before moving room elements.", "info");
      return;
    }
    const rect = floorRef.current?.getBoundingClientRect();
    if (!rect) return;

    event.preventDefault();
    event.stopPropagation();
    setDanceFloorDragState({
      offsetX: (event.clientX - rect.left) / floorZoom - danceFloorPosition.x,
      offsetY: (event.clientY - rect.top) / floorZoom - danceFloorPosition.y,
      previousLayout: buildFloorPlanLayout(),
    });
  };

  const startRoomObjectDrag = (object: RoomObject, event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("[data-object-control='true']")) return;
    if (layoutLocked) {
      showToast("Layout is locked. Unlock it before moving room objects.", "info");
      return;
    }
    const rect = floorRef.current?.getBoundingClientRect();
    if (!rect) return;

    event.preventDefault();
    event.stopPropagation();
    setRoomObjectDragState({
      objectId: object.id,
      offsetX: (event.clientX - rect.left) / floorZoom - object.x,
      offsetY: (event.clientY - rect.top) / floorZoom - object.y,
      width: object.width,
      height: object.height,
      label: object.label,
      previousLayout: buildFloorPlanLayout(),
    });
  };

  const startResize = (target: ResizeTarget, startSize: FloorSize, event: ReactPointerEvent<HTMLElement>) => {
    if (layoutLocked) {
      showToast("Layout is locked. Unlock it before resizing objects.", "info");
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setResizeState({
      target,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startSize,
      previousLayout: buildFloorPlanLayout(),
    });
  };

  const startFloorPan = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("[data-floor-object='true']")) return;
    const scrollElement = floorScrollRef.current;
    if (!scrollElement) return;

    event.preventDefault();
    setFloorPanState({
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: scrollElement.scrollLeft,
      scrollTop: scrollElement.scrollTop,
    });
  };

  const incrementAssignment = async (assignment: SeatingAssignment, amount: number) => {
    const nextCount = getAssignmentSeatCount(assignment) + amount;
    return supabase.from("seating").update({ guest_count: nextCount }).eq("id", assignment.id);
  };

  const decrementOrDeleteAssignment = async (assignment: SeatingAssignment) => {
    const sourceCount = getAssignmentSeatCount(assignment);
    if (sourceCount <= 1) {
      return supabase.from("seating").delete().eq("id", assignment.id);
    }

    return supabase.from("seating").update({ guest_count: sourceCount - 1 }).eq("id", assignment.id);
  };

  const createSingleSeatAssignment = async ({
    guestName,
    inviteCode,
    tableNumber,
  }: {
    guestName: string;
    inviteCode: string;
    tableNumber: number;
  }) =>
    supabase.from("seating").insert([
      {
        name: guestName,
        invite_code: inviteCode,
        table_number: tableNumber,
        guest_count: 1,
      },
    ]);

  const moveAssignedSeat = async (assignmentId: number, targetTable: number) => {
    const sourceAssignment = seatingAssignments.find((assignment) => assignment.id === assignmentId);
    if (!sourceAssignment) return;

    const inviteCode = normalizeInviteCode(sourceAssignment.invite_code);
    if (!inviteCode) {
      showToast("This seat is missing an invite code. Open the seating board to fix it.", "error");
      return;
    }

    if (sourceAssignment.table_number === targetTable) {
      showToast(`${sourceAssignment.name} is already at table ${targetTable}.`, "info");
      return;
    }

    const busyKey = `assignment:${assignmentId}`;
    setBusy(busyKey, true);

    const targetAssignment = seatingAssignments.find(
      (assignment) =>
        assignment.id !== sourceAssignment.id &&
        assignment.table_number === targetTable &&
        isSameSeatingIdentity(assignment, sourceAssignment),
    );

    if (targetAssignment) {
      const incrementResult = await incrementAssignment(targetAssignment, 1);
      if (incrementResult.error) {
        showToast(incrementResult.error.message, "error");
        setBusy(busyKey, false);
        return;
      }

      const decrementResult = await decrementOrDeleteAssignment(sourceAssignment);
      if (decrementResult.error) {
        showToast(decrementResult.error.message, "error");
        setBusy(busyKey, false);
        void fetchData();
        return;
      }
    } else if (getAssignmentSeatCount(sourceAssignment) <= 1) {
      const updateResult = await supabase.from("seating").update({ table_number: targetTable }).eq("id", assignmentId);
      if (updateResult.error) {
        showToast(updateResult.error.message, "error");
        setBusy(busyKey, false);
        return;
      }
    } else {
      const decrementResult = await decrementOrDeleteAssignment(sourceAssignment);
      if (decrementResult.error) {
        showToast(decrementResult.error.message, "error");
        setBusy(busyKey, false);
        return;
      }

      const createResult = await createSingleSeatAssignment({
        guestName: sourceAssignment.name,
        inviteCode,
        tableNumber: targetTable,
      });

      if (createResult.error) {
        showToast(createResult.error.message, "error");
        setBusy(busyKey, false);
        void fetchData();
        return;
      }
    }

    setBusy(busyKey, false);
    showToast(`${sourceAssignment.name} moved to table ${targetTable}.`, "success");
    void fetchData();
  };

  const seatUnseatedGuest = async (guestId: string, inviteCode: string, targetTable: number) => {
    const guest = responses.find((item) => item.id === guestId);
    if (!guest) return;
    const displayName = seatingDisplayNameByCode.get(inviteCode) || guest.guest_name;

    const busyKey = `guest:${guestId}`;
    setBusy(busyKey, true);

    const targetAssignment = seatingAssignments.find(
      (assignment) =>
        assignment.table_number === targetTable &&
        normalizeInviteCode(assignment.invite_code) === inviteCode &&
        normalizeSeatName(assignment.name) === normalizeSeatName(displayName),
    );

    const result = targetAssignment
      ? await incrementAssignment(targetAssignment, 1)
      : await createSingleSeatAssignment({
          guestName: displayName,
          inviteCode,
          tableNumber: targetTable,
        });

    setBusy(busyKey, false);

    if (result.error) {
      showToast(result.error.message, "error");
      return;
    }

    showToast(`${displayName} seated at table ${targetTable}.`, "success");
    void fetchData();
  };

  const performUnseatAssignedSeat = async (assignmentId: number) => {
    const assignment = seatingAssignments.find((item) => item.id === assignmentId);
    if (!assignment) return;

    const busyKey = `assignment:${assignmentId}`;
    setBusy(busyKey, true);
    const result = await decrementOrDeleteAssignment(assignment);
    setBusy(busyKey, false);

    if (result.error) {
      showToast(result.error.message, "error");
      return;
    }

    showToast(`${assignment.name} returned to pending seats.`, "success");
    void fetchData();
  };

  const confirmUnseatAssignedSeat = (assignmentId: number) => {
    const assignment = seatingAssignments.find((item) => item.id === assignmentId);
    if (!assignment) return;

    askConfirm({
      title: "Remove Seat?",
      message: `Remove one seat for ${assignment.name} from table ${assignment.table_number}? They will move back to Pending Seats.`,
      actionLabel: "Remove Seat",
      actionTone: "danger",
      onConfirm: () => performUnseatAssignedSeat(assignmentId),
    });
  };

  const handleDropOnTable = async (tableNumber: number) => {
    const payload = dragPayload;
    setDragPayload(null);
    setActiveTarget(null);
    if (!payload) return;

    if (payload.kind === "assigned") {
      await moveAssignedSeat(payload.assignmentId, tableNumber);
      return;
    }

    await seatUnseatedGuest(payload.guestId, payload.inviteCode, tableNumber);
  };

  const handleTapSeatActionOnTable = async (tableNumber: number) => {
    const payload = tapSeatAction;
    setTapSeatAction(null);
    setActiveTarget(null);
    if (!payload) return;

    if (payload.kind === "assigned") {
      await moveAssignedSeat(payload.assignmentId, tableNumber);
      return;
    }

    await seatUnseatedGuest(payload.guestId, payload.inviteCode, tableNumber);
  };

  const handleDropOnQueue = async () => {
    const payload = dragPayload;
    setDragPayload(null);
    setActiveTarget(null);
    if (!payload || payload.kind !== "assigned") return;
    confirmUnseatAssignedSeat(payload.assignmentId);
  };

  const handleTapActionToQueue = () => {
    const payload = tapSeatAction;
    setTapSeatAction(null);
    setActiveTarget(null);
    if (!payload || payload.kind !== "assigned") return;
    confirmUnseatAssignedSeat(payload.assignmentId);
  };

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-[#eef3f8] px-4 py-10 text-stone-900">
        <div className="mx-auto h-28 max-w-xl animate-pulse rounded-[28px] bg-white/70" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-[#eef3f8] px-4 py-10 text-stone-900">
        <section className="mx-auto max-w-xl rounded-[28px] border border-white bg-white p-8 text-center shadow-xl">
          <p className="wedding-kicker mb-3">Private Access</p>
          <h1 className="font-serif text-4xl text-stone-900">Floor Plan</h1>
          <p className="mt-4 text-sm leading-relaxed text-stone-500">Open Studio Pro first, then return to this page.</p>
          <Link href="/studio-pro" className="wedding-button-primary mt-8">
            Open Studio Pro
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-stone-900">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 px-3 py-2.5 shadow-sm backdrop-blur md:px-5">
        <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_minmax(360px,500px)_auto] xl:items-center">
          <div className="min-w-0">
            <p className="wedding-kicker mb-1">Studio Pro</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-2xl tracking-tight text-stone-900 md:text-3xl">Floor Plan Seat Manager</h1>
              <DatabaseEnvironmentBadge />
              {layoutLocked ? (
                <span className="rounded-full bg-stone-900 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white">
                  Layout Locked
                </span>
              ) : null}
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-stone-500 md:text-sm">
              Drag tables, guests, the dance floor, and room elements. Guest seating and floor layout are saved separately so planning stays controlled.
            </p>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Tables" value={stats.tables} />
            <Metric label="Seated" value={stats.seatedGuests} />
            <Metric label="Waiting" value={stats.waitingGuests} />
            <Metric label="Open Seats" value={stats.openSeats} />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end xl:max-w-[430px]">
            <Link href="/studio-pro" className="studio-compact-button">
              Studio Pro
            </Link>
            <Link href="/studio-pro/coordinator" className="studio-compact-button">
              Coordinator List
            </Link>
            <button
              type="button"
              onClick={() => {
                setLayoutLocked((prev) => !prev);
                showToast(layoutLocked ? "Layout unlocked. Tables and room objects can move again." : "Layout locked. Guest seating can still be edited.", "success");
              }}
              className={layoutLocked ? "studio-compact-button-primary" : "studio-compact-button"}
            >
              {layoutLocked ? "Locked" : "Lock Layout"}
            </button>
            <button
              type="button"
              onClick={undoLastLayoutChange}
              disabled={layoutHistory.length === 0}
              className="studio-compact-button disabled:cursor-not-allowed disabled:opacity-50"
            >
              Layout Undo
            </button>
            <button
              type="button"
              onClick={() => void saveFloorPlanLayout()}
              disabled={isSavingLayout}
              className={`studio-compact-button disabled:cursor-not-allowed disabled:opacity-60 ${
                isSavingLayout ? "animate-pulse ring-2 ring-emerald-200" : hasUnsavedLayoutChanges ? "ring-2 ring-amber-200" : ""
              }`}
            >
              {isSavingLayout ? (layoutSaveMode === "auto" ? "Autosaving..." : "Saving...") : "Save Layout"}
            </button>
            <button type="button" onClick={() => void captureFloorPlan()} className="studio-compact-button">
              Capture Image
            </button>
            <button type="button" onClick={openFloorPlanPreview} className="studio-compact-button">
              Share Preview
            </button>
            <button type="button" onClick={openPrintPacket} className="studio-compact-button">
              Print Packet
            </button>
            <button type="button" onClick={openTableGuestListPrint} className="studio-compact-button">
              Guest List
            </button>
            <button type="button" onClick={openVendorView} className="studio-compact-button">
              Vendor View
            </button>
            <button
              type="button"
              onClick={() => void refreshFloorPlan()}
              disabled={isRefreshing}
              className="studio-compact-button-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-82px)] lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside
          onDragOver={(event) => {
            event.preventDefault();
            setActiveTarget("queue");
          }}
          onDragLeave={() => setActiveTarget(null)}
          onDrop={() => void handleDropOnQueue()}
          className={`border-r border-stone-200 bg-white p-3 transition md:p-4 ${activeTarget === "queue" ? "bg-rose-50" : ""}`}
        >
          <div className="space-y-3">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="studio-input-compact"
              placeholder="Search names or invite codes"
            />

            <div className="studio-panel border-sky-100 bg-sky-50">
              <p className="wedding-kicker mb-2 text-sky-600">Guest Finder Spotlight</p>
              <input
                type="search"
                value={spotlightSearch}
                onChange={(event) => setSpotlightSearch(event.target.value)}
                className="studio-input-compact"
                placeholder="Search seating name, alias, table, or invite code"
              />
              <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
                {spotlightSearch.trim().length === 0 ? (
                  <p className="text-[11px] leading-relaxed text-sky-700">
                    Search a seating-row name, alias, table, or invite code. Selecting a seated row will pan the floor plan to that table.
                  </p>
                ) : guestFinderResults.length === 0 ? (
                  <p className="text-[11px] leading-relaxed text-sky-700">No matching guests found.</p>
                ) : (
                  guestFinderResults.map((result) => (
                    <button
                      key={result.key}
                      type="button"
                      onClick={() => focusGuestResult(result)}
                      className="w-full rounded-[12px] border border-sky-100 bg-white px-3 py-2 text-left shadow-sm transition hover:border-sky-200"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-serif text-base leading-tight text-stone-900">{result.guestName}</p>
                          <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-[0.12em] text-sky-600">{result.inviteCode}</p>
                          {result.aliases.length > 0 && (
                            <p className="mt-1 truncate text-[10px] text-stone-500">Aliases: {result.aliases.join(", ")}</p>
                          )}
                        </div>
                        <span className="shrink-0 rounded-full bg-sky-50 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-sky-700">
                          {result.tableNumber === null ? "Waiting" : `Table ${result.tableNumber}`}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
              {spotlightTargetKey ? (
                <button
                  type="button"
                  onClick={() => {
                    setSpotlightTargetKey(null);
                    setSpotlightSearch("");
                  }}
                  className="studio-mini-button mt-3 w-full"
                >
                  Clear Spotlight
                </button>
              ) : null}
            </div>

            <div className="studio-panel bg-white">
              <p className="wedding-kicker mb-2">Table Health</p>
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Open" value={stats.openTables} />
                <Metric label="Full" value={stats.fullTables} />
                <Metric label="Empty" value={stats.emptyTables} />
              </div>
              <div className="mt-3 max-h-36 space-y-1.5 overflow-y-auto pr-1">
                {tableModels.length === 0 ? (
                  <p className="text-[11px] leading-relaxed text-stone-500">Add a guest table to begin planning seats.</p>
                ) : (
                  tableModels.map((table) => {
                    const healthStyle = TABLE_HEALTH_STYLES[table.health];
                    return (
                      <button
                        key={`health-${table.tableNumber}`}
                        type="button"
                        onClick={() => focusTableOnFloor(table.tableNumber)}
                        className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-stone-100 bg-stone-50 px-2.5 py-2 text-left transition hover:border-stone-200"
                      >
                        <span className="font-serif text-base leading-none text-stone-900">Table {table.tableNumber}</span>
                        <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] ring-1 ${healthStyle.badge}`}>
                          {getTableHealthLabel(table.health, table.openSeats)}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="studio-panel bg-white">
              <p className="wedding-kicker mb-2">Planner Flow</p>
              <div className="space-y-2 text-sm leading-relaxed text-stone-600">
                <p><span className="font-bold text-stone-900">1.</span> Add or adjust guest tables.</p>
                <p><span className="font-bold text-stone-900">2.</span> Drag guests from the queue into open seats.</p>
                <p><span className="font-bold text-stone-900">3.</span> Arrange tables and room elements, then save the layout.</p>
              </div>
              <div className="mt-3 rounded-[12px] border border-stone-100 bg-stone-50 px-3 py-2 text-[11px] leading-relaxed text-stone-500">
                Refresh pulls new RSVPs and seating. Capture Image saves the current floor plan view.
              </div>
            </div>

            <div className="studio-panel">
              <p className="wedding-kicker mb-1">Guest Tables</p>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input
                  type="number"
                  min={1}
                  value={newTableNumber}
                  onChange={(event) => {
                    if (event.target.value === "") {
                      setNewTableNumber("");
                      return;
                    }
                    setNewTableNumber(Math.max(1, parseInt(event.target.value, 10) || 1));
                  }}
                  onBlur={() => {
                    if (newTableNumber === "") setNewTableNumber(1);
                  }}
                  className="studio-input-compact font-serif text-xl"
                />
                <button
                  type="button"
                  onClick={addGuestTable}
                  disabled={newTableNumber === "" || layoutLocked}
                  className="studio-compact-button-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              <select
                value={newTableShape}
                onChange={(event) => setNewTableShape(event.target.value as GuestTableShape)}
                className="studio-select-compact mt-2"
                aria-label="New guest table shape"
              >
                <option value="round">Round Table</option>
                <option value="square">Square Table</option>
                <option value="rect">Rectangular Table</option>
              </select>
              <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
                Add guest tables by number and choose the shape before placing them.
              </p>
              {tableModels.length > 0 && (
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                  {tableModels.map((table) => {
                    const tableBusy = busyKeys.includes(`table:${table.tableNumber}`);
                    return (
                      <div
                        key={table.tableNumber}
                        className={`min-w-0 rounded-[12px] border bg-white px-3 py-2.5 ${
                          selectedTableNumber === table.tableNumber
                            ? "border-sky-300 ring-2 ring-sky-100"
                            : table.health === "empty"
                              ? "border-stone-200"
                              : TABLE_HEALTH_STYLES[table.health].border
                        }`}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-stone-400">Table</p>
                            <p className="font-serif text-xl leading-none text-stone-900">{table.tableNumber}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs font-semibold text-stone-500">{table.units.length}/{table.capacity} seats</p>
                            <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] ring-1 ${TABLE_HEALTH_STYLES[table.health].badge}`}>
                              {getTableHealthLabel(table.health, table.openSeats)}
                            </span>
                            <button
                              type="button"
                              onClick={() => focusTableOnFloor(table.tableNumber)}
                              className="block w-full text-right text-[9px] font-bold uppercase tracking-[0.12em] text-sky-700"
                            >
                              Details
                            </button>
                          </div>
                        </div>
                        <select
                          value={table.shape}
                          onChange={(event) => updateTableShape(table.tableNumber, event.target.value as GuestTableShape)}
                          disabled={tableBusy || layoutLocked}
                          className="studio-select-compact h-8 bg-stone-50 py-1.5 disabled:opacity-60"
                          aria-label={`Table ${table.tableNumber} shape`}
                        >
                          <option value="round">Round Table</option>
                          <option value="square">Square Table</option>
                          <option value="rect">Rectangular Table</option>
                        </select>
                        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                          <div className="flex min-w-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateTableCapacity(table.tableNumber, table.capacity - 1)}
                              disabled={tableBusy || layoutLocked}
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 text-sm font-bold text-stone-600 disabled:opacity-60"
                              aria-label={`Remove a seat from table ${table.tableNumber}`}
                            >
                              -
                            </button>
                            <span className="min-w-14 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-stone-500">
                              {table.capacity} seats
                            </span>
                            <button
                              type="button"
                              onClick={() => updateTableCapacity(table.tableNumber, table.capacity + 1)}
                              disabled={tableBusy || layoutLocked}
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-900 text-sm font-bold text-white disabled:opacity-60"
                              aria-label={`Add a seat to table ${table.tableNumber}`}
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeGuestTable(table.tableNumber)}
                            disabled={tableBusy || layoutLocked}
                            className="rounded-full border border-rose-100 bg-rose-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-rose-700 disabled:cursor-wait disabled:opacity-60"
                          >
                            {tableBusy ? "Removing..." : "Remove"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={resetTableLayout}
                disabled={layoutLocked}
                className="studio-compact-button mt-3 w-full disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reset Layout
              </button>
            </div>

            <div className="studio-panel">
              <p className="wedding-kicker mb-2">Floor Elements</p>
              <label className="block text-xs font-bold uppercase tracking-[0.14em] text-stone-400">
                Center Logo Text
                <input
                  type="text"
                  value={floorMonogram}
                  onChange={(event) => updateFloorMonogram(event.target.value)}
                  className="studio-input-compact mt-2 normal-case tracking-normal"
                  placeholder="O & H"
                />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={stageVisible ? removeStage : addStage}
                  disabled={layoutLocked}
                  className={`min-h-9 rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    stageVisible
                      ? "border border-rose-100 bg-rose-50 text-rose-700"
                      : "bg-stone-900 text-white"
                  }`}
                >
                  {stageVisible ? "Remove Stage" : "Add Stage"}
                </button>
                <button
                  type="button"
                  onClick={danceFloorVisible ? removeDanceFloor : addDanceFloor}
                  disabled={layoutLocked}
                  className={`min-h-9 rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    danceFloorVisible
                      ? "border border-rose-100 bg-rose-50 text-rose-700"
                      : "bg-stone-900 text-white"
                  }`}
                >
                  {danceFloorVisible ? "Remove Dance" : "Add Dance"}
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-stone-400">Stage/Kosha and Dance Floor can also be removed from the floor plan itself.</p>
            </div>

            <div className="studio-panel">
              <p className="wedding-kicker mb-2">Add Room Object</p>
              <div className="grid gap-2">
                <select
                  value={roomObjectKind}
                  onChange={(event) => {
                    const nextKind = event.target.value as RoomObjectKind;
                    setRoomObjectKind(nextKind);
                  }}
                  className="studio-select-compact"
                >
                  <option value="round_table">Round Table</option>
                  <option value="square_table">Square Table</option>
                  <option value="rect_table">Rectangular Table</option>
                  <option value="bar">Bar</option>
                  <option value="cake">Cake Table</option>
                  <option value="buffet">Buffet</option>
                  <option value="photo_booth">Photo Booth</option>
                  <option value="lounge">Lounge Area</option>
                  <option value="sofa">Sofa</option>
                  <option value="sweetheart_table">Sweetheart Table</option>
                  <option value="kosha_backdrop">Kosha Backdrop</option>
                  <option value="floral_arch">Floral Arch</option>
                  <option value="welcome_sign">Welcome Sign</option>
                  <option value="escort_cards">Escort Cards</option>
                  <option value="gift_table">Gift Table</option>
                  <option value="dj_booth">DJ Booth</option>
                  <option value="dessert_table">Dessert Table</option>
                  <option value="coffee_station">Coffee Station</option>
                  <option value="cocktail_area">Cocktail Area</option>
                  <option value="ceremony_chairs">Ceremony Chairs</option>
                  <option value="aisle">Aisle</option>
                  <option value="greenery_wall">Greenery Wall</option>
                  <option value="memory_table">Memory Table</option>
                  <option value="kids_area">Kids Area</option>
                  <option value="high_top">High Top</option>
                  <option value="podium">Podium</option>
                  <option value="custom">Custom Object</option>
                </select>

                <input
                  type="text"
                  value={roomObjectLabel}
                  onChange={(event) => setRoomObjectLabel(event.target.value)}
                  className="studio-input-compact"
                  placeholder={`${ROOM_OBJECT_PRESETS[roomObjectKind].label} label`}
                />

                <button
                  type="button"
                  onClick={addRoomObject}
                  disabled={layoutLocked}
                  className="studio-compact-button-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add Object
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-stone-400">Objects can be dragged, resized, removed, and captured with the floor plan.</p>
            </div>

            <div className="studio-panel">
              <p className="wedding-kicker mb-2">View</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setFloorZoom((prev) => Math.max(0.65, Number((prev - 0.1).toFixed(2))))}
                  className="studio-compact-button"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => setFloorZoom(1)}
                  className="studio-compact-button text-[9px]"
                >
                  {Math.round(floorZoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => setFloorZoom((prev) => Math.min(1.35, Number((prev + 0.1).toFixed(2))))}
                  className="studio-compact-button"
                >
                  +
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={fitGridToLayout}
                  disabled={layoutLocked}
                  className="studio-compact-button disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Fit Grid
                </button>
                <button
                  type="button"
                  onClick={addGridSpace}
                  disabled={layoutLocked}
                  className="studio-compact-button disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add Space
                </button>
              </div>
              <label className="mt-3 block text-xs font-bold uppercase tracking-[0.14em] text-stone-400">
                Print Zoom
                <select
                  value={printZoom}
                  onChange={(event) => setPrintZoom(Number(event.target.value))}
                  className="studio-select-compact mt-2"
                >
                  <option value={0.4}>40% - Large Floor Plans</option>
                  <option value={0.55}>55% - Wide Room</option>
                  <option value={0.72}>72% - Default Print</option>
                  <option value={0.85}>85% - More Detail</option>
                  <option value={1}>100% - Full Size</option>
                </select>
              </label>
              <label className="mt-3 flex items-center gap-2 text-sm font-medium text-stone-600">
                <input
                  type="checkbox"
                  checked={showGuestLabels}
                  onChange={(event) => setShowGuestLabels(event.target.checked)}
                  className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-300"
                />
                Show names on seats
              </label>
              <label className="mt-3 flex items-center gap-2 text-sm font-medium text-stone-600">
                <input
                  type="checkbox"
                  checked={autoSaveLayout}
                  onChange={(event) => setAutoSaveLayout(event.target.checked)}
                  className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-300"
                />
                Autosave layout
              </label>
              <p className="mt-2 text-[11px] leading-relaxed text-stone-400">Seat labels show initials with the full invite code underneath so duplicate names stay clear.</p>
              <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
                {lastRefreshedAt ? `Last refreshed ${lastRefreshedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.` : "Refresh pulls the latest invitations and table assignments."}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
                {isSavingLayout
                  ? layoutSaveMode === "auto"
                    ? "Autosaving layout..."
                    : "Saving layout..."
                  : !autoSaveLayout
                  ? hasUnsavedLayoutChanges
                    ? "Unsaved layout changes. Use Save Layout when you are ready."
                    : "Autosave is off. Use Save Layout after floor-plan changes."
                  : hasUnsavedLayoutChanges
                    ? "Layout updated. Autosave will save it shortly."
                  : layoutStorageMode === "database"
                  ? lastLayoutSavedAt
                    ? `Layout saved ${lastLayoutSavedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
                    : "Layout saves automatically when autosave is on."
                  : layoutStorageMode === "browser"
                    ? "Layout saves on this device until shared floor-plan saving is set up."
                    : "Checking layout storage..."}
              </p>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="wedding-kicker mb-1">Seat Queue</p>
                  <h2 className="font-serif text-2xl text-stone-900">Guests Waiting For Seats</h2>
                </div>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">{unseatedUnits.length}</span>
              </div>

              <div className="space-y-2">
                {isLoading ? (
                  <div className="h-28 animate-pulse rounded-[18px] bg-stone-100" />
                ) : unseatedUnits.length === 0 ? (
                  <EmptyState title="All seated" detail="No attending in-person guests are waiting for a seat in this view." />
                ) : (
                  unseatedUnits.map((unit) => (
                    <GuestChip
                      key={unit.key}
                      unit={unit}
                      busy={busyKeys.includes(`guest:${unit.guestId}`)}
                      selected={tapSeatAction?.kind === "unseated" && tapSeatAction.guestId === unit.guestId}
                      onSelect={() => {
                        if (!unit.guestId || busyKeys.includes(`guest:${unit.guestId}`)) return;
                        setTapSeatAction({ kind: "unseated", guestId: unit.guestId, inviteCode: unit.inviteCode });
                        setSpotlightTargetKey(`waiting:${unit.inviteCode}`);
                        showToast(`${unit.householdName} selected. Tap a table to seat them.`, "info");
                      }}
                      onDragStart={() => {
                        if (!unit.guestId) return;
                        setTapSeatAction(null);
                        setDragPayload({ kind: "unseated", guestId: unit.guestId, inviteCode: unit.inviteCode });
                      }}
                      onDragEnd={() => {
                        setDragPayload(null);
                        setActiveTarget(null);
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </aside>

        <main
          ref={floorScrollRef}
          onPointerDown={startFloorPan}
          className={`overflow-auto ${floorPanState ? "cursor-grabbing" : "cursor-grab"}`}
        >
          {tapSeatAction && (
            <div className="sticky top-3 z-30 mx-3 mb-3 rounded-[16px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 shadow-xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-600">Tap-To-Seat Mode</p>
                  <p className="mt-1 font-semibold">
                    {tapSeatAction.kind === "assigned" ? `Moving ${tapSeatActionLabel}. Tap a table to move this seat.` : `${tapSeatActionLabel} selected. Tap a table to seat them.`}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {tapSeatAction.kind === "assigned" && (
                    <button type="button" onClick={handleTapActionToQueue} className="studio-compact-button bg-white">
                      Return to Queue
                    </button>
                  )}
                  <button type="button" onClick={() => setTapSeatAction(null)} className="studio-compact-button bg-white">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
          <div
            ref={floorRef}
            className="relative bg-white"
            style={{
              width: `${floorSize.width}px`,
              height: `${floorSize.height}px`,
              transform: `scale(${floorZoom})`,
              transformOrigin: "top left",
              backgroundImage:
                "linear-gradient(#eef2f7 1px, transparent 1px), linear-gradient(90deg, #eef2f7 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          >
            <div className="pointer-events-none absolute left-4 top-4 max-w-[280px] rounded-[12px] border border-stone-200 bg-white/92 px-3 py-2 text-xs leading-snug text-stone-500 shadow-sm">
              <p className="font-bold uppercase tracking-[0.12em] text-stone-400">Layout Status</p>
              <p className="mt-1">
                {layoutLocked
                  ? "Layout is locked. Guest seating can still be edited."
                  : isSavingLayout
                  ? layoutSaveMode === "auto"
                    ? "Autosaving layout..."
                    : "Saving layout..."
                  : hasUnsavedLayoutChanges
                    ? autoSaveLayout
                      ? "Layout changed. Autosave will update it shortly."
                      : "Layout changed. Use Save Layout when ready."
                    : "Layout is saved."}
              </p>
            </div>
            <div className="pointer-events-none absolute right-4 top-4 max-w-[260px] rounded-[12px] border border-stone-200 bg-white/90 px-3 py-2 text-xs leading-snug text-stone-500 shadow-sm">
              {layoutLocked ? "Layout is locked. Drag guests into seats, or unlock to move tables and room objects." : "Drag empty floor to pan. Drag objects to arrange."}
            </div>

            {stageVisible && (
              <div
                data-floor-object="true"
                onPointerDown={startStageDrag}
                className={`group absolute flex select-none items-center justify-center rounded-[10px] border-2 border-stone-500 bg-stone-50/95 shadow-sm ${
                  layoutLocked ? "cursor-default" : "cursor-move"
                }`}
                style={{
                  left: stagePosition.x,
                  top: stagePosition.y,
                  width: stageSize.width,
                  height: stageSize.height,
                }}
              >
                <div className="text-center">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500">Stage / Kosha</p>
                  {floorMonogram.trim() && <p className="mt-2 font-serif text-3xl text-stone-700">{floorMonogram.trim()}</p>}
                </div>
                <button
                  type="button"
                  data-object-control="true"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    removeStage();
                  }}
                  className={`absolute -right-2 -top-2 h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-[11px] font-bold text-white shadow ${
                    layoutLocked ? "hidden" : "hidden group-hover:flex"
                  }`}
                  aria-label="Remove stage"
                >
                  x
                </button>
                <button
                  type="button"
                  data-object-control="true"
                  onPointerDown={(event) => startResize("stage", stageSize, event)}
                  className={`absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-full border border-stone-300 bg-white shadow ${
                    layoutLocked ? "hidden" : ""
                  }`}
                  aria-label="Resize stage"
                />
              </div>
            )}

            {danceFloorVisible && (
              <div
                data-floor-object="true"
                onPointerDown={startDanceFloorDrag}
                className={`group absolute flex select-none items-center justify-center border-2 border-dashed border-stone-300 bg-white/90 shadow-sm ${
                  layoutLocked ? "cursor-default" : "cursor-move"
                }`}
                style={{
                  left: danceFloorPosition.x,
                  top: danceFloorPosition.y,
                  width: danceFloorSize.width,
                  height: danceFloorSize.height,
                }}
              >
                <div className="text-center">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Dance Floor</p>
                  {floorMonogram.trim() && <p className="mt-2 font-serif text-3xl text-stone-700">{floorMonogram.trim()}</p>}
                </div>
                <button
                  type="button"
                  data-object-control="true"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    removeDanceFloor();
                  }}
                  className={`absolute -right-2 -top-2 h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-[11px] font-bold text-white shadow ${
                    layoutLocked ? "hidden" : "hidden group-hover:flex"
                  }`}
                  aria-label="Remove dance floor"
                >
                  x
                </button>
                <button
                  type="button"
                  data-object-control="true"
                  onPointerDown={(event) => startResize("danceFloor", danceFloorSize, event)}
                  className={`absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-full border border-stone-300 bg-white shadow ${
                    layoutLocked ? "hidden" : ""
                  }`}
                  aria-label="Resize dance floor"
                />
              </div>
            )}

            {roomObjects.map((object) => (
              <RoomObjectView
                key={object.id}
                object={object}
                layoutLocked={layoutLocked}
                onStartDrag={(event) => startRoomObjectDrag(object, event)}
                onStartResize={(event) => startResize({ objectId: object.id }, { width: object.width, height: object.height }, event)}
                onRemove={() => removeRoomObject(object.id)}
              />
            ))}

            {tableModels.map((table) => (
              <VisualTable
                key={table.tableNumber}
                tableNumber={table.tableNumber}
                units={table.units}
                capacity={table.capacity}
                shape={table.shape}
                health={table.health}
                position={table.position}
                active={activeTarget === table.tableNumber}
                selected={selectedTableNumber === table.tableNumber}
                tapTargetActive={Boolean(tapSeatAction)}
                layoutLocked={layoutLocked}
                spotlightTargetKey={spotlightTargetKey}
                busyKeys={busyKeys}
                showGuestLabels={showGuestLabels}
                onDrop={() => void handleDropOnTable(table.tableNumber)}
                onDragOver={() => setActiveTarget(table.tableNumber)}
                onDragLeave={() => setActiveTarget(null)}
                onTapSeatAction={() => void handleTapSeatActionOnTable(table.tableNumber)}
                onStartTableDrag={(event) => startTableDrag(table.tableNumber, event)}
                onOpenDetails={() => focusTableOnFloor(table.tableNumber)}
                onDragUnit={(unit) => {
                  if (unit.assignmentId) {
                    setTapSeatAction(null);
                    setDragPayload({ kind: "assigned", assignmentId: unit.assignmentId, inviteCode: unit.inviteCode });
                  }
                }}
                onSelectUnit={(unit) => {
                  if (!unit.assignmentId || busyKeys.includes(`assignment:${unit.assignmentId}`)) return;
                  setTapSeatAction({ kind: "assigned", assignmentId: unit.assignmentId, inviteCode: unit.inviteCode });
                  setSpotlightTargetKey(getSeatUnitGroupKey(unit));
                  showToast(`${unit.householdName} selected. Tap another table to move this seat.`, "info");
                }}
                onUnseat={(unit) => {
                  if (unit.assignmentId) confirmUnseatAssignedSeat(unit.assignmentId);
                }}
              />
            ))}
          </div>
        </main>
      </div>

      {selectedTable && (
        <TableDetailDrawer
          tableNumber={selectedTable.tableNumber}
          units={selectedTable.units}
          capacity={selectedTable.capacity}
          shape={selectedTable.shape}
          health={selectedTable.health}
          openSeats={selectedTable.openSeats}
          spotlightTargetKey={spotlightTargetKey}
          onClose={() => setSelectedTableNumber(null)}
          onHighlightGuest={(spotlightKey) => setSpotlightTargetKey(spotlightKey)}
          onPrintPacket={openPrintPacket}
          onTableGuestListPrint={openTableGuestListPrint}
          onVendorView={openVendorView}
        />
      )}

      <div className="fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-[18px] border px-4 py-3 text-sm font-medium shadow-xl ${
              toast.tone === "success"
                ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                : toast.tone === "error"
                  ? "border-rose-100 bg-rose-50 text-rose-800"
                  : "border-stone-100 bg-white text-stone-700"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          actionLabel={confirmDialog.actionLabel}
          actionTone={confirmDialog.actionTone}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={async () => {
            await confirmDialog.onConfirm();
            setConfirmDialog(null);
          }}
        />
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-[12px] border border-stone-100 bg-stone-50 px-2.5 py-2">
      <p title={label} className="text-[8px] font-bold uppercase leading-tight tracking-[0.1em] text-stone-400">
        {label}
      </p>
      <p className="mt-0.5 truncate font-serif text-xl leading-none text-stone-900">{value}</p>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[18px] border border-dashed border-stone-200 bg-stone-50 px-4 py-6 text-center">
      <p className="font-serif text-xl text-stone-900">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-stone-500">{detail}</p>
    </div>
  );
}

function TableDetailDrawer({
  tableNumber,
  units,
  capacity,
  shape,
  health,
  openSeats,
  spotlightTargetKey,
  onClose,
  onHighlightGuest,
  onPrintPacket,
  onTableGuestListPrint,
  onVendorView,
}: {
  tableNumber: number;
  units: SeatUnit[];
  capacity: number;
  shape: GuestTableShape;
  health: TableHealth;
  openSeats: number;
  spotlightTargetKey: string | null;
  onClose: () => void;
  onHighlightGuest: (spotlightKey: string) => void;
  onPrintPacket: () => void;
  onTableGuestListPrint: () => void;
  onVendorView: () => void;
}) {
  const groupedGuests = Array.from(
    units.reduce((map, unit) => {
      const groupKey = getSeatUnitGroupKey(unit);
      const existing = map.get(groupKey);
      if (existing) {
        existing.count += 1;
        return map;
      }

      map.set(groupKey, {
        key: groupKey,
        householdName: unit.householdName,
        inviteCode: unit.inviteCode,
        count: 1,
      });
      return map;
    }, new Map<string, { key: string; householdName: string; inviteCode: string; count: number }>()),
  ).map(([, guest]) => guest);
  const status = getTableHealthLabel(health, openSeats);
  const healthStyle = TABLE_HEALTH_STYLES[health];

  return (
    <>
      <button type="button" aria-label="Close table details" onClick={onClose} className="fixed inset-0 z-[69] bg-stone-900/20" />
      <aside className="fixed inset-x-0 bottom-0 z-[70] flex max-h-[92vh] w-full flex-col rounded-t-[24px] border border-stone-200 bg-white shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:max-w-md md:rounded-none md:border-y-0 md:border-r-0">
      <div className="border-b border-stone-100 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="wedding-kicker mb-1">Table Detail</p>
            <h2 className="font-serif text-3xl text-stone-900">Table {tableNumber}</h2>
            <p className="mt-1 text-sm text-stone-500">
              {units.length}/{capacity} seats · {shape === "rect" ? "rectangular" : shape} table
            </p>
            <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ring-1 ${healthStyle.badge}`}>
              {status}
            </span>
          </div>
          <button type="button" onClick={onClose} className="studio-compact-button">
            Close
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button type="button" onClick={onPrintPacket} className="studio-compact-button-primary">
            Print Packet
          </button>
          <button type="button" onClick={onTableGuestListPrint} className="studio-compact-button">
            Guest List
          </button>
          <button type="button" onClick={onVendorView} className="studio-compact-button">
            Vendor View
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Seats Used" value={units.length} />
          <Metric label="Capacity" value={capacity} />
          <Metric label="Open Seats" value={openSeats} />
        </div>

        <div className="mt-5">
          <p className="wedding-kicker mb-2">Guests At This Table</p>
          <div className="space-y-2">
            {groupedGuests.length === 0 ? (
              <EmptyState title="No guests here yet" detail="Drag guests into this table from the waiting list." />
            ) : (
              groupedGuests.map((guest) => {
                const highlighted = spotlightTargetKey === guest.key;
                return (
                  <button
                    key={guest.key}
                    type="button"
                    onClick={() => onHighlightGuest(guest.key)}
                    className={`w-full rounded-[14px] border px-3 py-3 text-left transition ${
                      highlighted ? "border-sky-300 bg-sky-50 ring-2 ring-sky-100" : "border-stone-100 bg-stone-50 hover:border-stone-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-serif text-lg leading-tight text-stone-900">{guest.householdName}</p>
                        <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">{guest.inviteCode}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-stone-600 ring-1 ring-stone-200">
                        {guest.count} seat{guest.count === 1 ? "" : "s"}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
      </aside>
    </>
  );
}

function ConfirmDialog({
  title,
  message,
  actionLabel,
  actionTone = "default",
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  actionLabel: string;
  actionTone?: "danger" | "default";
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-stone-900/35 px-4">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-[30px] border border-stone-100 bg-white p-6 shadow-2xl md:p-8">
        <p className="wedding-kicker mb-2">Confirm Action</p>
        <h3 className="font-serif text-2xl text-stone-900 md:text-3xl">{title}</h3>
        <p className="mt-4 text-sm leading-relaxed text-stone-600">{message}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button onClick={onCancel} className="wedding-button-secondary w-full whitespace-normal text-center leading-snug sm:w-auto sm:max-w-full">
            Cancel
          </button>
          <button
            onClick={() => void onConfirm()}
            className={`wedding-button-primary w-full whitespace-normal text-center leading-snug sm:w-auto sm:max-w-full ${
              actionTone === "danger" ? "bg-rose-700 hover:bg-rose-600" : ""
            }`}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function GuestChip({
  unit,
  busy,
  selected,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  unit: SeatUnit;
  busy: boolean;
  selected: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <button
      type="button"
      draggable={!busy}
      onClick={onSelect}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`w-full min-w-0 cursor-grab rounded-[12px] border px-3 py-2.5 text-left shadow-sm transition active:cursor-grabbing ${
        selected
          ? "border-sky-300 bg-sky-50 ring-2 ring-sky-100"
          : busy
            ? "border-stone-100 bg-white opacity-50"
            : "border-stone-100 bg-white hover:border-sky-200 hover:bg-sky-50"
      }`}
    >
      <p title={unit.label} className="truncate font-serif text-base leading-tight text-stone-900">
        {unit.label}
      </p>
      <p title={unit.inviteCode} className="mt-1 truncate text-[9px] font-bold uppercase tracking-[0.12em] text-stone-400">
        {unit.inviteCode}
      </p>
    </button>
  );
}

function RoomObjectView({
  object,
  layoutLocked,
  onStartDrag,
  onStartResize,
  onRemove,
}: {
  object: RoomObject;
  layoutLocked: boolean;
  onStartDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  onStartResize: (event: ReactPointerEvent<HTMLElement>) => void;
  onRemove: () => void;
}) {
  const isRound = object.kind === "round_table" || object.kind === "cake";
  const isTable = isTableObject(object.kind);

  return (
    <section
      data-floor-object="true"
      onPointerDown={onStartDrag}
      className={`group absolute select-none ${layoutLocked ? "cursor-default" : "cursor-move"}`}
      style={{ left: object.x, top: object.y, width: object.width, height: object.height }}
    >
      <div
        className={`relative flex h-full w-full items-center justify-center border bg-white/95 text-center shadow-sm ${
          isRound ? "rounded-full" : object.kind === "square_table" ? "rounded-[8px]" : "rounded-[4px]"
        } ${isTable ? "border-stone-400" : "border-stone-300"}`}
      >
        <div className="px-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">
            {isTable ? "Table Object" : "Room Object"}
          </p>
          <p className="mt-1 text-sm font-bold leading-tight text-stone-700">{object.label}</p>
        </div>
      </div>
      <button
        type="button"
        data-object-control="true"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        className={`absolute -right-2 -top-2 h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-[11px] font-bold text-white shadow ${
          layoutLocked ? "hidden" : "hidden group-hover:flex"
        }`}
        aria-label={`Remove ${object.label}`}
      >
        x
      </button>
      <button
        type="button"
        data-object-control="true"
        onPointerDown={onStartResize}
        className={`absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-full border border-stone-300 bg-white shadow ${
          layoutLocked ? "hidden" : ""
        }`}
        aria-label={`Resize ${object.label}`}
      />
    </section>
  );
}

function VisualTable({
  tableNumber,
  units,
  capacity,
  shape,
  health,
  position,
  active,
  selected,
  tapTargetActive,
  layoutLocked,
  spotlightTargetKey,
  busyKeys,
  showGuestLabels,
  onDrop,
  onDragOver,
  onDragLeave,
  onTapSeatAction,
  onStartTableDrag,
  onOpenDetails,
  onDragUnit,
  onSelectUnit,
  onUnseat,
}: {
  tableNumber: number;
  units: SeatUnit[];
  capacity: number;
  shape: GuestTableShape;
  health: TableHealth;
  position: { x: number; y: number };
  active: boolean;
  selected: boolean;
  tapTargetActive: boolean;
  layoutLocked: boolean;
  spotlightTargetKey: string | null;
  busyKeys: string[];
  showGuestLabels: boolean;
  onDrop: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onTapSeatAction: () => void;
  onStartTableDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  onOpenDetails: () => void;
  onDragUnit: (unit: SeatUnit) => void;
  onSelectUnit: (unit: SeatUnit) => void;
  onUnseat: (unit: SeatUnit) => void;
}) {
  const seats = Array.from({ length: capacity }, (_, index) => units[index] || null);
  const tableSize = getGuestTableSize(shape);
  const healthStyle = TABLE_HEALTH_STYLES[health];

  return (
    <section
      data-floor-object="true"
      className="absolute h-[250px] w-[250px]"
      style={{ left: position.x, top: position.y }}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={(event) => {
        if (!tapTargetActive) return;
        if ((event.target as HTMLElement).closest("[data-object-control='true'], [data-seat-token='true']")) return;
        event.stopPropagation();
        onTapSeatAction();
      }}
    >
      <div
        onPointerDown={(event) => {
          if (tapTargetActive) {
            event.stopPropagation();
            return;
          }
          onStartTableDrag(event);
        }}
        className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center border bg-white shadow-sm transition ${
          active || tapTargetActive
            ? "border-sky-400 ring-8 ring-sky-100"
            : selected
              ? "border-sky-500 ring-4 ring-sky-100"
              : healthStyle.border
        } ${shape === "round" ? "rounded-full" : shape === "square" ? "rounded-[8px]" : "rounded-[12px]"} ${
          layoutLocked ? "cursor-default" : "cursor-move"
        } ${healthStyle.ring ? `ring-2 ${healthStyle.ring}` : ""} select-none`}
        style={{ width: tableSize.width, height: tableSize.height }}
      >
        <div className="text-center">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">Table</p>
          <p className="font-serif text-3xl text-stone-900">{tableNumber}</p>
          <p className="text-xs text-stone-400">
            {units.length}/{capacity} seats
          </p>
          <button
            type="button"
            data-object-control="true"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onOpenDetails();
            }}
            className="mt-1 rounded-full bg-stone-900 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-white shadow-sm"
          >
            Open
          </button>
        </div>
      </div>

      {seats.map((unit, index) => {
        const seatPosition = getTableSeatPosition(index, capacity, shape);
        const busy = unit?.assignmentId ? busyKeys.includes(`assignment:${unit.assignmentId}`) : false;
        const seatLabel = unit ? getSeatDisplayParts(unit, showGuestLabels) : null;
        const highlighted = Boolean(unit && spotlightTargetKey === getSeatUnitGroupKey(unit));

        return (
          <div
            data-seat-token="true"
            key={unit?.key || `empty-${tableNumber}-${index}`}
            title={unit ? `${unit.label} · ${unit.inviteCode}` : `Empty seat at table ${tableNumber}`}
            draggable={Boolean(unit) && !busy}
            onClick={(event) => {
              event.stopPropagation();
              if (unit) {
                onSelectUnit(unit);
                return;
              }
              if (tapTargetActive) onTapSeatAction();
            }}
            onDragStart={(event) => {
              if (!unit) return;
              event.dataTransfer.effectAllowed = "move";
              onDragUnit(unit);
            }}
            className={`group absolute flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-center font-bold leading-tight shadow-sm transition ${
              highlighted
                ? "cursor-grab border-sky-500 bg-sky-50 text-sky-800 ring-4 ring-sky-200"
                : unit
                ? busy
                  ? "cursor-wait border-sky-200 bg-sky-50 text-sky-700 opacity-60"
                  : "cursor-grab border-stone-400 bg-white text-stone-700 hover:border-sky-400 hover:bg-sky-50 active:cursor-grabbing"
                : "border-dashed border-stone-300 bg-white/80 text-stone-300"
            }`}
            style={{ left: seatPosition.left, top: seatPosition.top }}
          >
            {unit ? (
              <>
                <span className="flex max-w-[56px] flex-col items-center justify-center px-1 leading-none">
                  <span className="text-[10px] text-stone-800">{seatLabel?.primary}</span>
                  <span className="mt-1 w-full break-all text-center text-[7px] uppercase tracking-normal text-stone-500">{seatLabel?.code}</span>
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onUnseat(unit);
                  }}
                  className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[10px] text-white shadow group-hover:flex"
                  aria-label={`Unseat ${unit.label}`}
                >
                  x
                </button>
              </>
            ) : (
              "+"
            )}
          </div>
        );
      })}
    </section>
  );
}

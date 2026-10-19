import { z } from "zod";
import type { GameMapType } from "./GameTypes";

export const MAP_EDITOR_WIDTH = 128;
export const MAP_EDITOR_HEIGHT = 96;
export const COMMUNITY_MAP_PATTERN =
  /^Community:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;
export function communityMapId(map: string): string | undefined {
  return COMMUNITY_MAP_PATTERN.exec(map)?.[1];
}
export function communityMapKey(id: string): GameMapType {
  const key = `Community:${id}`;
  if (!COMMUNITY_MAP_PATTERN.test(key))
    throw new Error("Invalid community map ID");
  return key as GameMapType;
}
export const MapDraftSchema = z
  .object({
    name: z.string().trim().min(3).max(60),
    description: z.string().trim().max(600),
    gridWidth: z
      .union([z.literal(128), z.literal(256), z.literal(512)])
      .optional(),
    scale: z.union([
      z.literal(8),
      z.literal(12),
      z.literal(16),
      z.literal(24),
      z.literal(32),
    ]),
    tiles: z
      .array(z.number().int().min(0).max(3))
      .min(MAP_EDITOR_WIDTH * MAP_EDITOR_HEIGHT)
      .max(512 * 384),
    nations: z
      .array(
        z
          .object({
            name: z.string().trim().min(2).max(40),
            x: z.number().int().min(0).max(511),
            y: z.number().int().min(0).max(383),
          })
          .strict(),
      )
      .max(24),
  })
  .strict()
  .superRefine((draft, ctx) => {
    const width = draft.gridWidth ?? MAP_EDITOR_WIDTH;
    const height = (width * 3) / 4;
    if (draft.tiles.length !== width * height)
      ctx.addIssue({
        code: "custom",
        path: ["tiles"],
        message: "Terrain size must match the selected detail resolution.",
      });
    draft.nations.forEach((nation, index) => {
      if (nation.x >= width || nation.y >= height)
        ctx.addIssue({
          code: "custom",
          path: ["nations", index],
          message: "Nation spawn is outside the map.",
        });
    });
  });
export type MapDraft = z.infer<typeof MapDraftSchema>;
export function draftDimensions(draft: Pick<MapDraft, "gridWidth">) {
  const width = draft.gridWidth ?? MAP_EDITOR_WIDTH;
  return { width, height: (width * 3) / 4 };
}
export interface CommunityUser {
  id: string;
  username: string;
  role: "admin" | "player";
  createdAt: number;
  disabled: boolean;
}
export type CommunityMapStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "withdrawn";
export interface CommunityMapSummary {
  id: string;
  name: string;
  description: string;
  author: string;
  ownerId: string;
  status: CommunityMapStatus;
  notes: string;
  createdAt: number;
  reviewedAt: number | null;
  width: number;
  height: number;
}
export interface CommunityAdminUser extends CommunityUser {
  lastLoginAt: number | null;
  sessions: number;
  submissions: number;
  published: number;
}
export interface CommunityActivity {
  id: number;
  at: number;
  actor: string;
  action: string;
  target: string;
}
export interface CommunityAdminData {
  maps: CommunityMapSummary[];
  users: CommunityAdminUser[];
  activity: CommunityActivity[];
  stats: {
    accounts: number;
    disabled: number;
    sessions: number;
    pending: number;
    approved: number;
    rejected: number;
    withdrawn: number;
    assetBytes: number;
  };
}

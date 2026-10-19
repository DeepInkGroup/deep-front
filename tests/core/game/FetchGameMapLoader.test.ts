import { GameMapType } from "@openfront/engine-api/game/GameTypes";
import { FetchGameMapLoader } from "@openfront/shared/FetchGameMapLoader";
import { describe, expect, test, vi } from "vitest";

describe("FetchGameMapLoader", () => {
  test("loads community terrain as inline game data and rejects empty successful responses", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(4),
      statusText: "OK",
    }));
    vi.stubGlobal("fetch", fetchMock);
    const id = "a3700002-2026-4000-8000-000000000002";
    const map = new FetchGameMapLoader("/maps").getMapData(
      `Community:${id}` as GameMapType,
    );
    await expect(map.mapBin()).resolves.toHaveLength(4);
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/community/maps/${id}/map.bin?format=terrain`,
    );
    await map.map4xBin();
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/community/maps/${id}/map4x.bin?format=terrain`,
    );
    expect(map.webpPath).toBe(`/api/community/maps/${id}/thumbnail.svg`);
    fetchMock.mockImplementation(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
      statusText: "No Content",
    }));
    await expect(map.mapBin()).rejects.toThrow("Empty terrain response");
  });
  test("resolves each map file through the provided path resolver", async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
      json: async () => ({ url }),
      statusText: "OK",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const loader = new FetchGameMapLoader(
      (path) => `/_assets/maps/${path}.hashed`,
    );
    const mapData = loader.getMapData(GameMapType.BritanniaClassic);

    expect(mapData.webpPath).toBe(
      "/_assets/maps/britanniaclassic/thumbnail.webp.hashed",
    );

    await mapData.manifest();

    expect(fetchMock).toHaveBeenCalledWith(
      "/_assets/maps/britanniaclassic/manifest.json.hashed",
    );
  });

  test("loads the WebP layer, and the 4x variant for compact games", async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      blob: async () => new Blob(),
      statusText: "OK",
    }));
    vi.stubGlobal("fetch", fetchMock);
    const bitmap = {} as ImageBitmap;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => bitmap),
    );

    const loader = new FetchGameMapLoader("/maps");
    const mapData = loader.getMapData(GameMapType.China);

    await expect(mapData.layerImage("label", false)).resolves.toBe(bitmap);
    expect(fetchMock).toHaveBeenLastCalledWith("/maps/china/label.webp");

    await expect(mapData.layerImage("label", true)).resolves.toBe(bitmap);
    expect(fetchMock).toHaveBeenLastCalledWith("/maps/china/label.4x.webp");
  });
});

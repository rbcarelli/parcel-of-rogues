import type { StyleSpecification } from "maplibre-gl";

const INK = "#1c1610";
const LAND = "#f3e6c4";
const SEA = "#5d7f76";
const WOOD = "#c9b48a";
const SAND = "#ead7ae";
const HALO = "#f3e6c4";

const placeText = [
  "case",
  ["has", "name:nonlatin"],
  ["get", "name:latin"],
  ["coalesce", ["get", "name_en"], ["get", "name"]],
] as const;

export const vintageStyle: StyleSpecification = {
  version: 8,
  sources: {
    openmaptiles: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
    },
  },
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  layers: [
    { id: "background", type: "background", paint: { "background-color": LAND } },
    {
      id: "landcover-wood",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["==", ["get", "class"], "wood"],
      paint: { "fill-color": WOOD, "fill-opacity": 0.55 },
    },
    {
      id: "landcover-grass",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["in", ["get", "class"], ["literal", ["grass", "scrub"]]],
      paint: { "fill-color": "#d5c396", "fill-opacity": 0.4 },
    },
    {
      id: "landcover-sand",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["==", ["get", "class"], "sand"],
      paint: { "fill-color": SAND, "fill-opacity": 0.8 },
    },
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      filter: ["!=", ["get", "brunnel"], "tunnel"],
      paint: { "fill-color": SEA, "fill-outline-color": INK },
    },
    {
      id: "coastline",
      type: "line",
      source: "openmaptiles",
      "source-layer": "water",
      filter: ["!=", ["get", "brunnel"], "tunnel"],
      paint: {
        "line-color": INK,
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.4, 7, 2.2, 11, 3.4, 14, 4.5],
      },
    },
    {
      id: "coastline-shade",
      type: "line",
      source: "openmaptiles",
      "source-layer": "water",
      filter: ["!=", ["get", "brunnel"], "tunnel"],
      paint: {
        "line-color": "#6b5344",
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 11, 1.4],
        "line-offset": 1.2,
        "line-opacity": 0.85,
      },
    },
    {
      id: "waterway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      paint: { "line-color": "#6d8a80", "line-width": 0.8, "line-opacity": 0.7 },
    },
    {
      id: "boundary",
      type: "line",
      source: "openmaptiles",
      "source-layer": "boundary",
      filter: ["<=", ["get", "admin_level"], 4],
      paint: {
        "line-color": INK,
        "line-width": 0.6,
        "line-opacity": 0.28,
        "line-dasharray": [2, 2],
      },
    },
    {
      id: "label-state",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      minzoom: 3,
      filter: ["==", ["get", "class"], "state"],
      layout: {
        "text-field": placeText as unknown as string,
        "text-font": ["Noto Sans Italic"],
        "text-size": 13,
        "text-letter-spacing": 0.18,
        "text-transform": "uppercase",
        "text-max-width": 8,
      },
      paint: {
        "text-color": INK,
        "text-halo-color": HALO,
        "text-halo-width": 1.2,
        "text-opacity": 0.55,
      },
    },
    {
      id: "label-city",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      minzoom: 4,
      filter: ["==", ["get", "class"], "city"],
      layout: {
        "text-field": placeText as unknown as string,
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 4, 11, 10, 16],
        "text-letter-spacing": 0.08,
        "text-transform": "uppercase",
        "text-max-width": 8,
      },
      paint: {
        "text-color": INK,
        "text-halo-color": HALO,
        "text-halo-width": 1.4,
      },
    },
    {
      id: "label-town",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      minzoom: 8,
      filter: ["==", ["get", "class"], "town"],
      layout: {
        "text-field": placeText as unknown as string,
        "text-font": ["Noto Sans Italic"],
        "text-size": 12,
        "text-max-width": 8,
      },
      paint: {
        "text-color": INK,
        "text-halo-color": HALO,
        "text-halo-width": 1.2,
        "text-opacity": 0.85,
      },
    },
  ],
};

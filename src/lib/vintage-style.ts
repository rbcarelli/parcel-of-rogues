import type { StyleSpecification } from "maplibre-gl";

const INK = "#2a2118";
const SEA = "#6f8a82";
const LAND = "#e6d3a8";
const HALO = "#f3e6c4";

const placeText = ["coalesce", ["get", "name:en"], ["get", "name"]];

export const vintageStyle = {
  version: 8,
  name: "Parcel of Rogues",
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": LAND } },
    {
      id: "landcover",
      type: "fill",
      source: "osm",
      "source-layer": "landcover",
      paint: {
        "fill-color": [
          "match",
          ["get", "class"],
          "wood",
          "#d4c197",
          "grass",
          "#dcc9a0",
          "sand",
          "#e8d4aa",
          "#e0cba3",
        ],
        "fill-opacity": 0.55,
      },
    },
    {
      id: "landuse",
      type: "fill",
      source: "osm",
      "source-layer": "landuse",
      paint: { "fill-color": "#d9c49a", "fill-opacity": 0.35 },
    },
    {
      id: "water",
      type: "fill",
      source: "osm",
      "source-layer": "water",
      paint: { "fill-color": SEA, "fill-antialias": true, "fill-opacity": 0.92 },
    },
    {
      id: "waterway",
      type: "line",
      source: "osm",
      "source-layer": "waterway",
      paint: {
        "line-color": SEA,
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.4, 14, 2.2],
      },
    },
    {
      id: "coastline",
      type: "line",
      source: "osm",
      "source-layer": "water",
      paint: {
        "line-color": INK,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.7, 8, 1.4, 12, 2.2, 15, 3.1],
        "line-opacity": 0.92,
      },
    },
    {
      id: "boundary",
      type: "line",
      source: "osm",
      "source-layer": "boundary",
      filter: ["==", ["get", "admin_level"], 2],
      paint: {
        "line-color": "rgba(42, 33, 24, 0.28)",
        "line-width": 1,
        "line-dasharray": [3, 2],
      },
    },
    {
      id: "roads",
      type: "line",
      source: "osm",
      "source-layer": "transportation",
      minzoom: 9,
      paint: {
        "line-color": "rgba(42, 33, 24, 0.22)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.3, 14, 1.4],
      },
    },
    {
      id: "buildings",
      type: "fill",
      source: "osm",
      "source-layer": "building",
      minzoom: 12,
      paint: { "fill-color": "rgba(42, 33, 24, 0.12)" },
    },
    {
      id: "place-city",
      type: "symbol",
      source: "osm",
      "source-layer": "place",
      filter: ["in", ["get", "class"], ["literal", ["city", "town"]]],
      layout: {
        "text-field": placeText,
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11, 10, 16],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.06,
        "text-max-width": 8,
      },
      paint: {
        "text-color": INK,
        "text-halo-color": HALO,
        "text-halo-width": 1.4,
      },
    },
    {
      id: "place-village",
      type: "symbol",
      source: "osm",
      "source-layer": "place",
      filter: ["==", ["get", "class"], "village"],
      minzoom: 9,
      layout: {
        "text-field": placeText,
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
} as StyleSpecification;

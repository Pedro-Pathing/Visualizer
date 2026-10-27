{
  "startPoint": { "x": 20, "y": 72, "headingDeg": 0 },
  "lines": [
    {
      "kind": "atomic",
      "id": "line-through-block",
      "name": "Straight through the block",
      "endPoint": { "x": 120, "y": 72 },
      "controlPoints": [],
      "heading": { "type": "constant", "degrees": 0 },
      "color": "#5B9BD5",
      "waitAfterMs": 500,
      "waitAfterName": "Settle"
    },
    {
      "kind": "atomic",
      "id": "line-into-notch",
      "name": "Into the notch",
      "endPoint": { "x": 120, "y": 95 },
      "controlPoints": [],
      "heading": { "type": "constant", "degrees": 90 },
      "color": "#ED7D31"
    },
    {
      "kind": "atomic",
      "id": "line-back-out",
      "name": "Back out past the post",
      "endPoint": { "x": 60, "y": 40 },
      "controlPoints": [{ "x": 120, "y": 40 }],
      "heading": { "type": "tangential", "reverse": true },
      "color": "#70AD47"
    }
  ],
  "shapes": [
    {
      "id": "shape-block",
      "name": "Block",
      "vertices": [
        { "x": 60, "y": 66 },
        { "x": 70, "y": 66 },
        { "x": 70, "y": 78 },
        { "x": 60, "y": 78 }
      ],
      "color": "#dc2626",
      "fillColor": "#ff6b6b"
    },
    {
      "id": "shape-notch",
      "name": "Notched wall",
      "vertices": [
        { "x": 100, "y": 90 },
        { "x": 110, "y": 90 },
        { "x": 110, "y": 105 },
        { "x": 130, "y": 105 },
        { "x": 130, "y": 90 },
        { "x": 140, "y": 90 },
        { "x": 140, "y": 115 },
        { "x": 100, "y": 115 }
      ],
      "color": "#dc2626",
      "fillColor": "#ff6b6b"
    },
    {
      "id": "shape-post",
      "name": "Post",
      "vertices": [
        { "x": 95, "y": 33 },
        { "x": 103, "y": 33 },
        { "x": 99, "y": 43 }
      ],
      "color": "#dc2626",
      "fillColor": "#ff6b6b"
    }
  ],
  "sequence": [
    { "kind": "path", "lineId": "line-through-block" },
    { "kind": "path", "lineId": "line-into-notch" },
    { "kind": "path", "lineId": "line-back-out" }
  ],
  "fieldPoints": [],
  "robot": { "rLength": 16, "rWidth": 16, "safetyMargin": 1 },
  "version": "2.0.0",
  "timestamp": "2026-10-01T00:00:00.000Z"
}

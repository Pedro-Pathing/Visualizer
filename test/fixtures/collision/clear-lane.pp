{
  "startPoint": { "x": 30, "y": 30, "headingDeg": 0 },
  "lines": [
    {
      "kind": "atomic",
      "id": "line-east",
      "name": "Along the bottom",
      "endPoint": { "x": 110, "y": 30 },
      "controlPoints": [],
      "heading": { "type": "tangential", "reverse": false },
      "color": "#5B9BD5"
    },
    {
      "kind": "atomic",
      "id": "line-north",
      "name": "Up the side",
      "endPoint": { "x": 110, "y": 110 },
      "controlPoints": [],
      "heading": { "type": "tangential", "reverse": false },
      "color": "#ED7D31"
    },
    {
      "kind": "atomic",
      "id": "line-around",
      "name": "Arc back over the top",
      "endPoint": { "x": 30, "y": 100 },
      "controlPoints": [{ "x": 70, "y": 130 }],
      "heading": { "type": "linear", "startDeg": 90, "endDeg": 270 },
      "color": "#70AD47"
    }
  ],
  "shapes": [
    {
      "id": "shape-center",
      "name": "Center block",
      "vertices": [
        { "x": 55, "y": 55 },
        { "x": 85, "y": 55 },
        { "x": 85, "y": 85 },
        { "x": 55, "y": 85 }
      ],
      "color": "#dc2626",
      "fillColor": "#ff6b6b"
    }
  ],
  "sequence": [
    { "kind": "path", "lineId": "line-east" },
    { "kind": "path", "lineId": "line-north" },
    { "kind": "path", "lineId": "line-around" }
  ],
  "fieldPoints": [],
  "robot": { "rLength": 16, "rWidth": 16, "safetyMargin": 1 },
  "version": "2.0.0",
  "timestamp": "2026-10-01T00:00:00.000Z"
}

{
  "startPoint": { "x": 20, "y": 20, "headingDeg": 0 },
  "lines": [
    {
      "kind": "atomic",
      "id": "line-up-left",
      "name": "Up the left side",
      "endPoint": { "x": 20, "y": 130 },
      "controlPoints": [],
      "heading": { "type": "constant", "degrees": 0 },
      "color": "#5B9BD5"
    },
    {
      "kind": "atomic",
      "id": "line-along-top",
      "name": "Diagonal along the top",
      "endPoint": { "x": 100, "y": 125 },
      "controlPoints": [],
      "heading": { "type": "constant", "degrees": 45 },
      "color": "#ED7D31"
    },
    {
      "kind": "atomic",
      "id": "line-wide-swing",
      "name": "Swing wide down the right",
      "endPoint": { "x": 110, "y": 40 },
      "controlPoints": [{ "x": 160, "y": 90 }],
      "heading": { "type": "tangential", "reverse": false },
      "color": "#70AD47"
    }
  ],
  "shapes": [],
  "sequence": [
    { "kind": "path", "lineId": "line-up-left" },
    { "kind": "path", "lineId": "line-along-top" },
    { "kind": "path", "lineId": "line-wide-swing" }
  ],
  "fieldPoints": [],
  "robot": { "rLength": 16, "rWidth": 16, "safetyMargin": 1 },
  "version": "2.0.0",
  "timestamp": "2026-10-01T00:00:00.000Z"
}

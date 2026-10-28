{
  "startPoint": { "x": 9, "y": 60, "headingDeg": 0 },
  "lines": [
    {
      "kind": "atomic",
      "id": "line-straight",
      "name": "Drive out",
      "endPoint": { "x": 36, "y": 60 },
      "controlPoints": [],
      "heading": { "type": "constant", "degrees": 0 },
      "color": "#5B9BD5",
      "waitAfterMs": 750,
      "waitAfterName": "Intake"
    },
    {
      "kind": "compound",
      "id": "group-sweep",
      "name": "Sweep",
      "color": "#ED7D31",
      "heading": { "type": "linear", "startDeg": 0, "endDeg": 90 },
      "segments": [
        {
          "kind": "atomic",
          "id": "line-quadratic",
          "endPoint": { "x": 60, "y": 84 },
          "controlPoints": [{ "x": 60, "y": 60 }],
          "heading": { "type": "tangential", "reverse": false },
          "color": "#A5A5A5"
        },
        {
          "kind": "atomic",
          "id": "line-cubic",
          "endPoint": { "x": 84, "y": 108 },
          "controlPoints": [
            { "x": 60, "y": 100 },
            { "x": 70, "y": 110 }
          ],
          "heading": { "type": "tangential", "reverse": true },
          "color": "#FFC000"
        }
      ]
    },
    {
      "kind": "atomic",
      "id": "line-high-order",
      "endPoint": { "x": 120, "y": 72 },
      "controlPoints": [
        { "x": 100, "y": 130 },
        { "x": 130, "y": 120 },
        { "x": 110, "y": 90 }
      ],
      "heading": {
        "type": "piecewise",
        "piecewiseHeading": {
          "segments": [
            {
              "startProgress": 0,
              "endProgress": 0.4,
              "interpolationType": "linear",
              "parameters": { "startDeg": 90, "endDeg": 45 }
            },
            {
              "startProgress": 0.4,
              "endProgress": 0.7,
              "interpolationType": "facing-point",
              "parameters": { "point": { "x": 132, "y": 132 } }
            },
            {
              "startProgress": 0.7,
              "endProgress": 1,
              "interpolationType": "constant",
              "continueFromPrevious": true,
              "parameters": { "degrees": -90 }
            }
          ]
        }
      },
      "color": "#4472C4",
      "locked": true
    },
    {
      "kind": "atomic",
      "id": "line-through",
      "name": "Curve through",
      "endPoint": { "x": 40, "y": 24 },
      "controlPoints": [],
      "throughPoints": [
        { "x": 100, "y": 40 },
        { "x": 70, "y": 20 }
      ],
      "heading": { "type": "tangential", "reverse": false },
      "color": "#70AD47"
    }
  ],
  "shapes": [
    {
      "id": "shape-1",
      "name": "Submersible",
      "vertices": [
        { "x": 60, "y": 30 },
        { "x": 80, "y": 30 },
        { "x": 70, "y": 45 }
      ],
      "color": "#dc2626",
      "fillColor": "#ff6b6b"
    }
  ],
  "sequence": [
    { "kind": "path", "lineId": "line-straight" },
    { "kind": "wait", "id": "wait-1", "name": "Spin up", "durationMs": 1000 },
    { "kind": "path", "lineId": "line-quadratic" },
    { "kind": "path", "lineId": "line-cubic" },
    { "kind": "path", "lineId": "line-high-order" },
    { "kind": "path", "lineId": "line-through" }
  ],
  "fieldPoints": [
    { "x": 72, "y": 72, "color": "#ffffff", "radius": 1.5 },
    { "x": 24, "y": 120 }
  ],
  "version": "1.5.0",
  "timestamp": "2026-10-01T00:00:00.000Z"
}

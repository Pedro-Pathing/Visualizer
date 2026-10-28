{
  "startPoint": { "x": 8, "y": 64, "heading": "constant", "degrees": 0 },
  "lines": [
    {
      "endPoint": { "x": 40, "y": 64 },
      "controlPoints": [],
      "heading": "constant",
      "color": "#7DB9C6",
      "waitAfter": { "name": "Score", "durationMs": 500 }
    },
    {
      "endPoint": { "x": 60, "y": 100, "heading": "tangential", "reverse": true },
      "controlPoints": [{ "x": 60, "y": 64 }],
      "color": "#A6C78B"
    },
    {
      "endPoint": { "x": 24, "y": 120, "heading": "linear", "startDeg": 90, "endDeg": 180 },
      "controlPoints": [
        { "x": 60, "y": 130 },
        { "x": 30, "y": 100 }
      ]
    }
  ]
}

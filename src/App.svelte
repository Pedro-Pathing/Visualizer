<script lang="ts">
  import * as d3 from "d3";
  import { onMount } from "svelte";
  import Two from "two.js";
  import type { Path } from "two.js/src/path";
  import type { Line as PathLine } from "two.js/src/shapes/line";
  import ControlTab from "./lib/ControlTab.svelte";
  import Navbar from "./lib/Navbar.svelte";
  import _ from "lodash";
  import {
    easeInOutQuad,
    getCurvePoint,
    getMousePos,
    getRandomColor,
    quadraticToCubic,
    radiansToDegrees,
    shortestRotation,
  } from "./utils";
  import hotkeys from 'hotkeys-js';

  let two: Two;
  let twoElement: HTMLDivElement;

  let pointRadius = 1.15;
  let lineWidth = 0.57;
  let robotWidth = 16;
  let robotHeight = 16;
  let settings: FPASettings = {
    xVelocity: 60,
    yVelocity: 60,
    aVelocity: Math.PI,
    kFriction: 0.05,
    rWidth: robotWidth,
    rHeight: robotHeight
  };

  let x

  let percent: number = 0;

  // Initialize default shapes - start with no obstacles
  let shapes: Shape[] = [];



  /**
   * Converter for X axis from inches to pixels.
   */
  $: x = d3
    .scaleLinear()
    .domain([0, 144])
    .range([0, twoElement?.clientWidth ?? 144]);

  /**
   * Converter for Y axis from inches to pixels.
   */
  $: y = d3
    .scaleLinear()
    .domain([0, 144])
    .range([twoElement?.clientHeight ?? 144, 0]);

  let lineGroup = new Two.Group();
  lineGroup.id = "line-group";
  let pointGroup = new Two.Group();
  pointGroup.id = "point-group";
  let shapeGroup = new Two.Group();
  shapeGroup.id = "shape-group";

  let startPoint: Point = {
    x: 56,
    y: 8,
    heading: "linear",
    startDeg: 90,
    endDeg: 180
  };
  let lines: Line[] = [
    {
      name: "Path 1",
      endPoint: { x: 56, y: 36, heading: "linear", startDeg: 90, endDeg: 180 },
      controlPoints: [],
      color: getRandomColor(),
    },
  ];

  $: points = (() => {
    let _points = [];
    let startPointElem = new Two.Circle(
      x(startPoint.x),
      y(startPoint.y),
      x(pointRadius)
    );
    startPointElem.id = `point-0-0`;
    startPointElem.fill = lines[0].color;
    startPointElem.noStroke();

    _points.push(startPointElem);

    lines.forEach((line, idx) => {
      [line.endPoint, ...line.controlPoints].forEach((point, idx1) => {
        if (idx1 > 0) {
          let pointGroup = new Two.Group();
          pointGroup.id = `point-${idx + 1}-${idx1}`;

          let pointElem = new Two.Circle(
            x(point.x),
            y(point.y),
            x(pointRadius)
          );
          pointElem.id = `point-${idx + 1}-${idx1}-background`;
          pointElem.fill = line.color;
          pointElem.noStroke();

          let pointText = new Two.Text(
            `${idx1}`,
            x(point.x),
            y(point.y - 0.15),
            x(pointRadius)
          );
          pointText.id = `point-${idx + 1}-${idx1}-text`;
          pointText.size = x(1.55);
          pointText.leading = 1;
          pointText.family = "ui-sans-serif, system-ui, sans-serif";
          pointText.alignment = "center";
          pointText.baseline = "middle";
          pointText.fill = "white";
          pointText.noStroke();

          pointGroup.add(pointElem, pointText);
          _points.push(pointGroup);
        } else {
          let pointElem = new Two.Circle(
            x(point.x),
            y(point.y),
            x(pointRadius)
          );
          pointElem.id = `point-${idx + 1}-${idx1}`;
          pointElem.fill = line.color;
          pointElem.noStroke();
          _points.push(pointElem);
        }
      });
    });

    // Add obstacle vertices as draggable points
    shapes.forEach((shape, shapeIdx) => {
      shape.vertices.forEach((vertex, vertexIdx) => {
        let pointGroup = new Two.Group();
        pointGroup.id = `obstacle-${shapeIdx}-${vertexIdx}`;

        let pointElem = new Two.Circle(
          x(vertex.x),
          y(vertex.y),
          x(pointRadius)
        );
        pointElem.id = `obstacle-${shapeIdx}-${vertexIdx}-background`;
        pointElem.fill = "#991b1b"; // Match obstacle color
        pointElem.noStroke();

        let pointText = new Two.Text(
          `${vertexIdx + 1}`,
          x(vertex.x),
          y(vertex.y - 0.15),
          x(pointRadius)
        );
        pointText.id = `obstacle-${shapeIdx}-${vertexIdx}-text`;
        pointText.size = x(1.55);
        pointText.leading = 1;
        pointText.family = "ui-sans-serif, system-ui, sans-serif";
        pointText.alignment = "center";
        pointText.baseline = "middle";
        pointText.fill = "white";
        pointText.noStroke();

        pointGroup.add(pointElem, pointText);
        _points.push(pointGroup);
      });
    });

    return _points;
  })();

  $: path = (() => {
    let _path: (Path | PathLine)[] = [];

    lines.forEach((line, idx) => {
      let _startPoint = idx === 0 ? startPoint : lines[idx - 1].endPoint;

      let lineElem: Path | PathLine;
      if (line.controlPoints.length > 2) {
        // Approximate an n-degree bezier curve by sampling it at 100 points
        const samples = 100;
        const cps = [_startPoint, ...line.controlPoints, line.endPoint];
        let points = [new Two.Anchor(x(_startPoint.x), y(_startPoint.y), 0, 0, 0, 0, Two.Commands.move)];
        for (let i = 1; i <= samples; ++i) {
          const point = getCurvePoint(i / samples, cps);
          points.push(new Two.Anchor(x(point.x), y(point.y), 0, 0, 0, 0, Two.Commands.line));
        }
        points.forEach((point) => (point.relative = false));

        lineElem = new Two.Path(points);
        lineElem.automatic = false;
      } else if (line.controlPoints.length > 0) {
        let cp1 = line.controlPoints[1]
          ? line.controlPoints[0]
          : quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint)
              .Q1;
        let cp2 =
          line.controlPoints[1] ??
          quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint)
            .Q2;

        let points = [
          new Two.Anchor(
            x(_startPoint.x),
            y(_startPoint.y),
            x(_startPoint.x),
            y(_startPoint.y),
            x(cp1.x),
            y(cp1.y),
            Two.Commands.move
          ),
          new Two.Anchor(
            x(line.endPoint.x),
            y(line.endPoint.y),
            x(cp2.x),
            y(cp2.y),
            x(line.endPoint.x),
            y(line.endPoint.y),
            Two.Commands.curve
          ),
        ];
        points.forEach((point) => (point.relative = false));

        lineElem = new Two.Path(points);
        lineElem.automatic = false;
      } else {
        lineElem = new Two.Line(
          x(_startPoint.x),
          y(_startPoint.y),
          x(line.endPoint.x),
          y(line.endPoint.y)
        );
      }

      lineElem.id = `line-${idx + 1}`;
      lineElem.stroke = line.color;
      lineElem.linewidth = x(lineWidth);
      lineElem.noFill();

      _path.push(lineElem);
    });

    return _path;
  })();

  $: shapeElements = (() => {
    let _shapes: Path[] = [];

    shapes.forEach((shape, idx) => {
      if (shape.vertices.length >= 3) {
        // Create polygon from vertices - properly format for Two.js
        let vertices = [];
        
        // Start with move command for first vertex
        vertices.push(new Two.Anchor(
          x(shape.vertices[0].x), 
          y(shape.vertices[0].y), 
          0, 0, 0, 0, 
          Two.Commands.move
        ));
        
        // Add line commands for remaining vertices
        for (let i = 1; i < shape.vertices.length; i++) {
          vertices.push(new Two.Anchor(
            x(shape.vertices[i].x), 
            y(shape.vertices[i].y), 
            0, 0, 0, 0, 
            Two.Commands.line
          ));
        }
        
        // Close the shape
        vertices.push(new Two.Anchor(
          x(shape.vertices[0].x), 
          y(shape.vertices[0].y), 
          0, 0, 0, 0, 
          Two.Commands.close
        ));
        
        vertices.forEach((point) => (point.relative = false));
        
        let shapeElement = new Two.Path(vertices);
        shapeElement.id = `shape-${idx}`;
        shapeElement.stroke = "#991b1b"; // Deeper red border (red-800)
        shapeElement.fill = "#ef4444"; // Deeper red fill (red-500)
        shapeElement.opacity = 0.4; // Make it pretty transparent
        shapeElement.linewidth = x(0.8); // Make border more visible
        shapeElement.automatic = false;
        
        _shapes.push(shapeElement);
      }
    });

    return _shapes;
  })();

  let robotXY: BasePoint = { x: 0, y: 0 };
  let robotHeading: number = 0;

  $: {
    let totalLineProgress = (lines.length * Math.min(percent, 99.999999999)) / 100;
    let currentLineIdx = Math.min(Math.trunc(totalLineProgress), lines.length - 1);
    let currentLine = lines[currentLineIdx];

    let linePercent = easeInOutQuad(totalLineProgress - Math.floor(totalLineProgress));
    let _startPoint = currentLineIdx === 0 ? startPoint : lines[currentLineIdx - 1].endPoint;
    let robotInchesXY = getCurvePoint(linePercent, [_startPoint, ...currentLine.controlPoints, currentLine.endPoint]);
    robotXY = { x: x(robotInchesXY.x), y: y(robotInchesXY.y) };

    switch (currentLine.endPoint.heading) {
      case "linear":
        robotHeading = -shortestRotation(
          currentLine.endPoint.startDeg,
          currentLine.endPoint.endDeg,
          linePercent
        );
        break;
      case "constant":
        robotHeading = -currentLine.endPoint.degrees;
        break;
      case "tangential":
        const nextPointInches = getCurvePoint(
          linePercent + (currentLine.endPoint.reverse ? -0.01 : 0.01),
          [_startPoint, ...currentLine.controlPoints, currentLine.endPoint]
        );
        const nextPoint = { x: x(nextPointInches.x), y: y(nextPointInches.y) };

        const dx = nextPoint.x - robotXY.x;
        const dy = nextPoint.y - robotXY.y;

        if (dx !== 0 || dy !== 0) {
          const angle = Math.atan2(dy, dx);

          robotHeading = radiansToDegrees(angle);
        }

        break;
    }
  }

  $: (() => {
    if (!two) {
      return;
    }

    two.renderer.domElement.style["z-index"] = "30";
    two.renderer.domElement.style["position"] = "absolute";
    two.renderer.domElement.style["top"] = "0px";
    two.renderer.domElement.style["left"] = "0px";
    two.renderer.domElement.style["width"] = "100%";
    two.renderer.domElement.style["height"] = "100%";

    two.clear();

    two.add(...shapeElements);
    two.add(...path);
    two.add(...points);

    two.update();
  })();

  let playing = false;

  let animationFrame: number;
  let startTime: number | null = null;
  let previousTime: number | null = null;

  function animate(timestamp: number) {
    if (!startTime) {
      startTime = timestamp;
    }

    if (previousTime !== null) {
      const deltaTime = timestamp - previousTime;

      if (percent >= 100) {
        percent = 0;
      } else {
        percent += (0.65 / lines.length) * (deltaTime * 0.1);
      }
    }

    previousTime = timestamp;

    if (playing) {
      requestAnimationFrame(animate);
    }
  }

  function play() {
    if (!playing) {
      playing = true;
      startTime = null;
      previousTime = null;
      animationFrame = requestAnimationFrame(animate);
    }
  }

  function pause() {
    playing = false;
    cancelAnimationFrame(animationFrame);
  }

  async function fpa(l: FPALine, s: FPASettings, o: Shape): Promise<Line> {
    let status = 'Starting optimization...';
    let result = null;
    // Convert to arrays, not JSON strings - this was the main issue!
    // If no obstacle vertices, create a small default obstacle outside the field
    const obstacle = o.vertices.length >= 3 ? 
      o.vertices.map(p => [p.x, p.y]) : 
      [[-10, -10], [-10, -5], [-5, -5], [-5, -10]]; // Small rectangle outside field
      
    const inputWaypoints = [l.startPoint, ...l.controlPoints, l.endPoint].map(p => [p.x, p.y]);
    
    // Extract heading degrees based on Point type
    let startHeadingDeg = 0;
    let endHeadingDeg = 0;
    
    if (l.startPoint.heading === "linear") {
      startHeadingDeg = l.startPoint.startDeg ?? 0;
    } else if (l.startPoint.heading === "constant") {
      startHeadingDeg = (l.startPoint as any).degrees ?? 0;
    }
    
    if (l.endPoint.heading === "linear") {
      endHeadingDeg = l.endPoint.endDeg ?? 0;
    } else if (l.endPoint.heading === "constant") {
      endHeadingDeg = (l.endPoint as any).degrees ?? 0;
    }
    
    console.log('FPA Optimization Parameters:');
    console.log('Waypoints:', inputWaypoints);
    console.log('Obstacle:', obstacle);
    console.log('Start heading:', startHeadingDeg);
    console.log('End heading:', endHeadingDeg);
    console.log('Settings:', s);
    
    const payload = {
                waypoints: inputWaypoints,
                start_heading_degrees: startHeadingDeg,
                end_heading_degrees: endHeadingDeg,
                x_velocity: s.xVelocity,
                y_velocity: s.yVelocity,
                angular_velocity: s.aVelocity,
                friction_coefficient: s.kFriction,
                obstacle: obstacle,
                robot_width: s.rWidth,
                robot_height: s.rHeight,
                min_coord_field: 0,
                max_coord_field: 144,
                interpolation: l.interpolation === "tangential" ? "tangent" : l.interpolation
    };
    try {
      result = await runOptimization(payload);
      status = 'Optimization Complete!';
    } catch (e: any) {
      status = 'Error: ' + e.message;
      throw e;
    }

    // result is already parsed JSON data, no need to call .json()
    const resultData = result;
    
    // Handle the new API format that returns optimized_waypoints
    let optimizedWaypoints;
    if (resultData.optimized_waypoints) {
      optimizedWaypoints = resultData.optimized_waypoints;
    } else if (Array.isArray(resultData)) {
      // Legacy format support
      optimizedWaypoints = resultData;
    } else {
      throw new Error('Unexpected result format from optimization API');
    }
    
    // Handle the different Point types based on heading
    let endPoint: Point;
    
    if (l.interpolation === "tangential") {
      endPoint = {
        x: optimizedWaypoints[optimizedWaypoints.length - 1][0], 
        y: optimizedWaypoints[optimizedWaypoints.length - 1][1], 
        heading: "tangential",
        reverse: l.endPoint.reverse ?? false
      };
    } else if (l.interpolation === "constant") {
      endPoint = {
        x: optimizedWaypoints[optimizedWaypoints.length - 1][0], 
        y: optimizedWaypoints[optimizedWaypoints.length - 1][1], 
        heading: "constant",
        degrees: (l.endPoint as any).degrees ?? 0
      };
    } else {
      // linear
      endPoint = {
        x: optimizedWaypoints[optimizedWaypoints.length - 1][0], 
        y: optimizedWaypoints[optimizedWaypoints.length - 1][1], 
        heading: "linear",
        startDeg: l.endPoint.startDeg ?? 0,
        endDeg: l.endPoint.endDeg ?? 0
      };
    }
    
    return {
      name: l.name,
      endPoint,
      color: l.color,
      controlPoints: optimizedWaypoints.slice(1, optimizedWaypoints.length - 1).map((p: number[]) => ({ x: p[0], y: p[1] }))
    }
  
    /*return {
        endPoint: { x: 36, y: 80, heading: "linear", startDeg: 0, endDeg: 0 },
        controlPoints: [],
        color: getRandomColor(),
      }*/
  }


    function sleep(ms: number) {
        return new Promise(res => setTimeout(res, ms));
    }

    export async function createTask(payload: any) {
        try {
            console.log('Creating optimization task with payload:', payload);
            const response = await fetch('https://fpa.pedropathing.com/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            console.log('Response status:', response.status);
            
            // Handle offline response from service worker
            if (response.status === 503) {
                const errorData = await response.json();
                if (errorData.error === 'offline') {
                    throw new Error('OFFLINE: ' + errorData.message);
                }
            }
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('Job created with ID:', data.job_id);
            return data.job_id;
        } catch (error) {
            console.error('Failed to create optimization task:', error);
            throw error;
        }
    }

    export async function pollForResult(jobId: string, pollInterval = 1000, maxTries = 60) {
        for (let i = 0; i < maxTries; i++) {
            try {
                const response = await fetch(`https://fpa.pedropathing.com/job/${jobId}`);
                
                // Handle offline response from service worker
                if (response.status === 503) {
                    const errorData = await response.json();
                    if (errorData.error === 'offline') {
                       console.log('OFFLINE: ' + errorData.message)
                        throw new Error('OFFLINE: ' + errorData.message);
                    }
                }
                
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                const data = await response.json();
                if (data.status === 'completed' && data.result) {
                    return data.result;
                } else if (data.status === 'error') {
                    throw new Error('Optimization failed with error.');
                }
                await sleep(pollInterval);
            } catch (error) {
                console.error(`Polling attempt ${i + 1} failed:`, error);
                if (i === maxTries - 1) throw error; // Re-throw on last attempt
                await sleep(pollInterval);
            }
        }
        console.log('Polling timed out after', maxTries, 'attempts.')
        throw new Error('Timeout waiting for job result.');
    }

    // 3. Run Optimization - creates task, then polls for result and returns it
    export async function runOptimization(payload: any, pollInterval = 1000, maxTries = 60) {
        const jobId = await createTask(payload);
        const result = await pollForResult(jobId, pollInterval, maxTries);
        return result;
    }

  onMount(() => {
    two = new Two({
      fitted: true,
      type: Two.Types.svg,
    }).appendTo(twoElement);

    updateRobotImage();

    let currentElem: string | null = null;
    let isDown = false;

    two.renderer.domElement.addEventListener("mousemove", (evt: MouseEvent) => {
      const elem = document.elementFromPoint(evt.clientX, evt.clientY);
      if (isDown && currentElem) {
        const { x: xPos, y: yPos } = getMousePos(evt, two.renderer.domElement);

        if (currentElem.startsWith("obstacle-")) {
          // Handle obstacle vertex dragging
          const parts = currentElem.split("-");
          const shapeIdx = Number(parts[1]);
          const vertexIdx = Number(parts[2]);
          
          shapes[shapeIdx].vertices[vertexIdx].x = x.invert(xPos);
          shapes[shapeIdx].vertices[vertexIdx].y = y.invert(yPos);
        } else {
          // Handle path point dragging
          const line = Number(currentElem.split("-")[1]) - 1;
          const point = Number(currentElem.split("-")[2]);

          if (line === -1) {
            startPoint.x = x.invert(xPos);
            startPoint.y = y.invert(yPos);
          } else {
            if (point === 0) {
              lines[line].endPoint.x = x.invert(xPos);
              lines[line].endPoint.y = y.invert(yPos);
            } else {
              lines[line].controlPoints[point - 1].x = x.invert(xPos);
              lines[line].controlPoints[point - 1].y = y.invert(yPos);
            }
          }
        }
      } else {
        if (elem?.id.startsWith("point") || elem?.id.startsWith("obstacle")) {
          two.renderer.domElement.style.cursor = "pointer";
          currentElem = elem.id;
        } else {
          two.renderer.domElement.style.cursor = "auto";
          currentElem = null;
        }
      }
    });
    two.renderer.domElement.addEventListener("mousedown", () => {
      isDown = true;
    });
    two.renderer.domElement.addEventListener("mouseup", () => {
      isDown = false;
    });
  });

  document.addEventListener("keydown", function (evt) {
    if (evt.code === "Space" && document.activeElement === document.body) {
      if (playing) {
        pause();
      } else {
        play();
      }
    }
  });

  function saveFile() {
    const jsonString = JSON.stringify({ startPoint, lines, shapes });

    const blob = new Blob([jsonString], { type: "application/json" });

    const linkObj = document.createElement("a");

    const url = URL.createObjectURL(blob);

    linkObj.href = url;
    linkObj.download = "trajectory.pp";

    document.body.appendChild(linkObj);

    linkObj.click();

    document.body.removeChild(linkObj);

    URL.revokeObjectURL(url);
  }

  function loadFile(evt: Event) {
    const elem = evt.target as HTMLInputElement;
    const file = elem.files?.[0];

    if (file) {
      const reader = new FileReader();

      reader.onload = function (e: ProgressEvent<FileReader>) {
        try {
          const result = e.target?.result as string;

          const jsonObj: {
            startPoint: Point;
            lines: Line[];
            shapes?: Shape[];
          } = JSON.parse(result);

          startPoint = jsonObj.startPoint;
          lines = jsonObj.lines;
          if (jsonObj.shapes) {
            shapes = jsonObj.shapes;
          }
        } catch (err) {
          console.error(err);
        }
      };

      reader.readAsText(file);
    }
  }

  function loadRobot(evt: Event) {
    const elem = evt.target as HTMLInputElement;
    const file = elem.files?.[0];

    if (file && file.type === "image/png") {
      const reader = new FileReader();

      reader.onload = function (e: ProgressEvent<FileReader>) {
        const result = e.target?.result as string;
        localStorage.setItem('robot.png', result);
        updateRobotImage();
      };

      reader.readAsDataURL(file);
    } else {
      console.error("Invalid file type. Please upload a PNG file.");
    }
  }

  function updateRobotImage() {
    const robotImage = document.querySelector('img[alt="Robot"]') as HTMLImageElement;
    const storedImage = localStorage.getItem('robot.png');
    if (robotImage && storedImage) {
      robotImage.src = storedImage;
    }
  }

  function addNewLine() {
  lines = [
    ...lines,
    {
      endPoint: {
        x: _.random(36, 108),
        y: _.random(36, 108),
        heading: "tangential",
        reverse: true,
        // Remove startDeg/endDeg for tangential type if not needed by your Point type
      } as Point,
      controlPoints: [],
      color: getRandomColor(),
    },
  ];
}


function addControlPoint() {
  if (lines.length > 0) {
    const lastLine = lines[lines.length - 1];
    lastLine.controlPoints.push({
      x: _.random(36, 108),
      y: _.random(36, 108),
    });
  }
}

function removeControlPoint() {
  if (lines.length > 0) {
    const lastLine = lines[lines.length - 1];
    if (lastLine.controlPoints.length > 0) {
      lastLine.controlPoints.pop();
    }
  }
}

hotkeys('w', function(event, handler){
  event.preventDefault();
  addNewLine();
});


hotkeys('a', function(event, handler){
  event.preventDefault();
  addControlPoint();
  two.update();
});

hotkeys('s', function(event, handler){
  event.preventDefault();
  removeControlPoint();
  two.update();
});

</script>

<Navbar bind:lines bind:startPoint bind:shapes bind:settings bind:robotWidth bind:robotHeight {saveFile} {loadFile} {loadRobot}/>
<div
  class="w-screen h-screen pt-20 p-2 flex flex-row justify-center items-center gap-2"
>
  <div class="flex h-full justify-center items-center">
    <div
      bind:this={twoElement}
      class="h-full aspect-square rounded-lg shadow-md bg-neutral-50 dark:bg-neutral-900 relative overflow-clip"
    >
      <img
        src="/fields/decode.webp"
        alt="Field"
        class="absolute top-0 left-0 w-full h-full rounded-lg z-10 pointer-events-none"
      />
      <img
        src={"/robot.png"}
        alt="Robot"
        style={`position: absolute; top: ${robotXY.y}px; left: ${robotXY.x}px; transform: translate(-50%, -50%) rotate(${robotHeading}deg); z-index: 20; width: ${x(robotWidth)}px; height: ${x(robotHeight)}px;`}
      />
    </div>
  </div>
  <ControlTab
    bind:playing
    {play}
    {pause}
    bind:startPoint
    bind:lines
    bind:robotWidth
    bind:robotHeight
    bind:settings
    bind:percent
    bind:robotXY
    bind:robotHeading
    bind:shapes
    {x}
    {y}
    {fpa}
  />
</div>

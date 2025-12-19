// ...existing code...
<script lang="ts">
  import { showAllCollisions } from '../stores';
  import prettier from "prettier";
  import prettierJavaPlugin from "prettier-plugin-java";
  import { onMount } from "svelte";
  import { copy } from "svelte-copy";
  import Highlight from "svelte-highlight";
  import { java } from "svelte-highlight/languages";
  import codeStyle from "svelte-highlight/styles/androidstudio";
  import { cubicInOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import { darkMode, showRuler, showProtractor, showGrid, protractorLockToRobot, gridSize, clickToPlaceMode, centerLineWarningEnabled, showCollisionPath, collisionNextSegmentOnly, showRobotLiveCoordinates, showRobotOriginToCornerLines, showRobotColliderEdges, collisionBoxColor, robotCollisionColor } from "../stores";
  import { getRandomColor, titleCase } from "../utils";
  import html2canvas from "html2canvas";
  import GIF from "gif.js";

  export let saveFile: () => any;
  export let loadFile: (evt: any) => any;
  export let loadRobot: (evt: any) => any;
  export let undo: () => void;
  export let redo: () => void;
  export let canUndo: boolean = false;
  export let canRedo: boolean = false;
  export const fieldElement: HTMLElement | null = null;
  export let captureGif: () => Promise<void>;

  let exportFullCode = false;
  export let startPoint: Point;
  export let lines: Line[];
  export let robotWidth: number;
  export let robotHeight: number;
  export let settings: FPASettings;
  export let percent: number = 0;
  export let gifFps: number = 30;
  
  let isRecording = false;
  let recordingProgress = 0;

  // Calculate total path duration based on animation speed
  // Animation: percent += (0.65 / lines.length) * (deltaTime * 0.1)
  // To go from 0 to 100: 100 = (0.65 / lines.length) * (totalTime * 0.1)
  // totalTime = 100 * lines.length / (0.65 * 0.1) = 100 * lines.length / 0.065
  $: basePathDuration = (100 * lines.length) / (0.65 * 0.1 * 1000); // in seconds (movement only)
  $: totalWaitTime = lines.reduce((sum, line) => sum + (line.waitTime || 0), 0); // sum of all wait times
  $: totalPathDuration = basePathDuration + totalWaitTime; // total including waits
  $: currentTime = (percent / 100) * totalPathDuration; // percent 0-100 maps to total duration
  $: isOverTime = totalPathDuration > 30;

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
  }

  let selectedGridSize = 12;
  const gridSizeOptions = [12, 24, 36, 48];

  let dialogOpen = false;
  let settingsOpen = false;

  // Handlers moved out of the template to avoid Svelte preprocessor errors
  function onCollisionBoxColorInput(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    collisionBoxColor.set(v);
  }

  function onRobotCollisionColorInput(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    robotCollisionColor.set(v);
  }

  // Display value for angular velocity (user inputs this, gets multiplied by PI)
  $: angularVelocityDisplay = settings ? settings.aVelocity / Math.PI : 1;

  onMount(() => {
    const unsubscribeDarkMode = darkMode.subscribe((val) => {
      if (val === "light") {
        document.documentElement.classList.remove("dark");
      } else {
        document.documentElement.classList.add("dark");
      }
    });

    const unsubscribeGridSize = gridSize.subscribe((value) => {
      selectedGridSize = value;
    });

    window.onbeforeunload = () => {
      return "Are you sure you want to leave?";
    };

    return () => {
      unsubscribeDarkMode();
      unsubscribeGridSize();
    };
  });

  let exportedCode = "";

  function handleGridSizeChange(event: Event) {
    const value = Number((event.target as HTMLSelectElement).value);
    selectedGridSize = value;
    gridSize.set(value);
  }

  async function exportToCode() {
    const headingTypeToFunctionName = {
      constant: "setConstantHeadingInterpolation",
      linear: "setLinearHeadingInterpolation",
      tangential: "setTangentHeadingInterpolation",
    };

    let pathsClass = `
    public static class Paths {
      ${lines.map((line, idx) => {
          const variableName = line.name ? line.name.replace(/[^a-zA-Z0-9]/g, '') : `line${idx + 1}`;
          return `public PathChain ${variableName};`
                              }
                      ).join("\n")
      }
      public Paths(Follower follower) {
        ${lines.map((line, idx) => {
          const variableName = line.name ? line.name.replace(/[^a-zA-Z0-9]/g, '') : `line${idx + 1}`;
          return `${variableName} = follower.pathBuilder().addPath(
          ${line.controlPoints.length === 0 ? `new BezierLine` : `new BezierCurve`}(
            ${
                                      idx === 0
                                              ? `new Pose(${startPoint.x.toFixed(3)}, ${startPoint.y.toFixed(3)}),`
                                              : `new Pose(${lines[idx - 1].endPoint.x.toFixed(3)}, ${lines[idx - 1].endPoint.y.toFixed(3)}),`
                              }
            ${
                                      line.controlPoints.length > 0
                                              ? `${line.controlPoints
                                                      .map(
                                                              (point) =>
                                                                      `new Pose(${point.x.toFixed(3)}, ${point.y.toFixed(3)})`
                                                      )
                                                      .join(",\n")},`
                                              : ""
                              }
            new Pose(${line.endPoint.x.toFixed(3)}, ${line.endPoint.y.toFixed(3)})
          )
        ).${headingTypeToFunctionName[line.endPoint.heading]}(${line.endPoint.heading === "constant" ? `Math.toRadians(${line.endPoint.degrees})` : line.endPoint.heading === "linear" ? `Math.toRadians(${line.endPoint.startDeg}), Math.toRadians(${line.endPoint.endDeg})` : ""})
        ${line.endPoint.reverse ? ".setReversed(true)" : ""}
        .build(); ${line.waitTime && line.waitTime > 0 ? `// WAIT: ${line.waitTime} seconds after this path` : ''}`
                              }
                      )
                      .join("\n\n")};
      }
    }
    `;

    let file = '';
    if (!exportFullCode) {
      file = pathsClass;
    } else {
      file = `
      package org.firstinspires.ftc.teamcode;
      import com.qualcomm.robotcore.eventloop.opmode.OpMode;
      import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
      import com.bylazar.configurables.annotations.Configurable;
      import com.bylazar.telemetry.TelemetryManager;
      import com.bylazar.telemetry.PanelsTelemetry;
      import org.firstinspires.ftc.teamcode.pedroPathing.Constants;
      import com.pedropathing.geometry.BezierCurve;
      import com.pedropathing.geometry.BezierLine;
      import com.pedropathing.follower.Follower;
      import com.pedropathing.paths.PathChain;
      import com.pedropathing.geometry.Pose;
      @Autonomous(name = "Pedro Pathing Autonomous", group = "Autonomous")
      @Configurable // Panels
      public class PedroAutonomous extends OpMode {
        private TelemetryManager panelsTelemetry; // Panels Telemetry instance
        public Follower follower; // Pedro Pathing follower instance
        private int pathState; // Current autonomous path state (state machine)
        private Paths paths; // Paths defined in the Paths class
        @Override
        public void init() {
          panelsTelemetry = PanelsTelemetry.INSTANCE.getTelemetry();

          follower = Constants.createFollower(hardwareMap);
          follower.setStartingPose(new Pose(72, 8, Math.toRadians(90)));

          paths = new Paths(follower); // Build paths

          panelsTelemetry.debug("Status", "Initialized");
          panelsTelemetry.update(telemetry);
        }
        @Override
        public void loop() {
          follower.update(); // Update Pedro Pathing
          pathState = autonomousPathUpdate(); // Update autonomous state machine

          // Log values to Panels and Driver Station
          panelsTelemetry.debug("Path State", pathState);
          panelsTelemetry.debug("X", follower.getPose().getX());
          panelsTelemetry.debug("Y", follower.getPose().getY());
          panelsTelemetry.debug("Heading", follower.getPose().getHeading());
          panelsTelemetry.update(telemetry);
        }

        ${pathsClass}

        public int autonomousPathUpdate() {
            // Add your state machine Here
            // Access paths with paths.pathName
            // Refer to the Pedro Pathing Docs (Auto Example) for an example state machine
            return pathState;
        }
      }
      `
    }

    console.log(file);

    await prettier
      .format(file, {
        parser: "java",
        plugins: [prettierJavaPlugin],
      })
      .then((res) => {
        exportedCode = res;
      })
      .catch((e) => {
        console.error(e);
      });

    dialogOpen = true;
  }

  function openSettings() {
      settingsOpen = true;
  }

  function mirrorPathsHorizontal() {
    // Mirror all points horizontally across the center of the field (x = 72)
    const centerX = 72;
    startPoint.x = 2 * centerX - startPoint.x;
    // Clamp after mirroring
    startPoint.x = Math.max(1, Math.min(143, startPoint.x));
    if (typeof startPoint.heading === 'number') {
      startPoint.heading = 180 - startPoint.heading;
    }
    if (typeof startPoint.startDeg === 'number') {
      startPoint.startDeg = 180 - startPoint.startDeg;
    }
    if (typeof startPoint.endDeg === 'number') {
      startPoint.endDeg = 180 - startPoint.endDeg;
    }
    lines = lines.map(line => ({
      ...line,
      endPoint: {
        ...line.endPoint,
        x: 2 * centerX - line.endPoint.x,
        ...(typeof line.endPoint.heading === 'number' ? { heading: 180 - line.endPoint.heading } : {}),
        ...(typeof line.endPoint.startDeg === 'number' ? { startDeg: 180 - line.endPoint.startDeg } : {}),
        ...(typeof line.endPoint.endDeg === 'number' ? { endDeg: 180 - line.endPoint.endDeg } : {}),
      },
      controlPoints: line.controlPoints.map(cp => ({
        ...cp,
        x: 2 * centerX - cp.x,
        ...(typeof cp.heading === 'number' ? { heading: 180 - cp.heading } : {}),
        ...(typeof cp.startDeg === 'number' ? { startDeg: 180 - cp.startDeg } : {}),
        ...(typeof cp.endDeg === 'number' ? { endDeg: 180 - cp.endDeg } : {}),
      }))
    }));
  }

  function mirrorPathsVertical() {
    // Mirror all points vertically across the center of the field (y = 72)
    const centerY = 72;
    startPoint.y = 2 * centerY - startPoint.y;
    // Clamp after mirroring
    startPoint.y = Math.max(3, Math.min(143, startPoint.y));
    if (typeof startPoint.heading === 'number') {
      startPoint.heading = -startPoint.heading;
    }
    if (typeof startPoint.startDeg === 'number') {
      startPoint.startDeg = -startPoint.startDeg;
    }
    if (typeof startPoint.endDeg === 'number') {
      startPoint.endDeg = -startPoint.endDeg;
    }
    lines = lines.map(line => ({
      ...line,
      endPoint: {
        ...line.endPoint,
        y: 2 * centerY - line.endPoint.y,
        ...(typeof line.endPoint.heading === 'number' ? { heading: -line.endPoint.heading } : {}),
        ...(typeof line.endPoint.startDeg === 'number' ? { startDeg: -line.endPoint.startDeg } : {}),
        ...(typeof line.endPoint.endDeg === 'number' ? { endDeg: -line.endDeg } : {}),
      },
      controlPoints: line.controlPoints.map(cp => ({
        ...cp,
        y: 2 * centerY - cp.y,
        ...(typeof cp.heading === 'number' ? { heading: -cp.heading } : {}),
        ...(typeof cp.startDeg === 'number' ? { startDeg: -cp.startDeg } : {}),
        ...(typeof cp.endDeg === 'number' ? { endDeg: -cp.endDeg } : {}),
      }))
    }));
  }

  $: if (settings) {
    settings.rHeight = robotHeight;
    settings.rWidth = robotWidth;
  }
</script>

<svelte:head>
  {@html codeStyle}
</svelte:head>

<div
  class="absolute top-0 left-0 w-full bg-neutral-100 dark:bg-neutral-950 shadow-md flex flex-row justify-between items-center px-6 py-4 border-b-[0.75px] border-[#b300e6]"
>
  <div class="font-semibold flex flex-row justify-start items-start">
    <div>Pedro Pathing Visualizer</div>
    <div class="ml-2">
    <a
      target="_blank"
      rel="norefferer"
      title="GitHub Repo"
      href="https://github.com/Pedro-Pathing/Visualizer"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 30 30"
        class="size-6 dark:fill-white"
      >
        <path
          d="M15,3C8.373,3,3,8.373,3,15c0,5.623,3.872,10.328,9.092,11.63C12.036,26.468,12,26.28,12,26.047v-2.051 c-0.487,0-1.303,0-1.508,0c-0.821,0-1.551-0.353-1.905-1.009c-0.393-0.729-0.461-1.844-1.435-2.526 c-0.289-0.227-0.069-0.486,0.264-0.451c0.615,0.174,1.125,0.596,1.605,1.222c0.478,0.627,0.703,0.769,1.596,0.769 c0.433,0,1.081-0.025,1.691-0.121c0.328-0.833,0.895-1.6,1.588-1.962c-3.996-0.411-5.903-2.399-5.903-5.098 c0-1.162,0.495-2.286,1.336-3.233C9.053,10.647,8.706,8.73,9.435,8c1.798,0,2.885,1.166,3.146,1.481C13.477,9.174,14.461,9,15.495,9 c1.036,0,2.024,0.174,2.922,0.483C18.675,9.17,19.763,8,21.565,8c0.732,0.731,0.381,2.656,0.102,3.594 c0.836,0.945,1.328,2.066,1.328,3.226c0,2.697-1.904,4.684-5.894,5.097C18.199,20.49,19,22.1,19,23.313v2.734 c0,0.104-0.023,0.179-0.035,0.268C23.641,24.676,27,20.236,27,15C27,8.373,21.627,3,15,3z"
        ></path>
      </svg>
    </a>
    </div>

  </div>
  <div class="flex flex-row justify-end items-center gap-4">
    <!-- Stopwatch Display -->
    <div 
      class="flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-sm transition-all duration-300"
      class:bg-red-500={isOverTime}
      class:bg-neutral-200={!isOverTime}
      class:dark:bg-neutral-800={!isOverTime}
      class:text-white={isOverTime}
      class:shadow-red-500={isOverTime}
      class:shadow-lg={isOverTime}
      class:animate-pulse={isOverTime}
      title={isOverTime ? "Path exceeds 30 second limit!" : "Path duration"}
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
      <span class="tabular-nums">{formatTime(currentTime)}</span>
      <span class="text-xs opacity-70">/</span>
      <span class="tabular-nums">{formatTime(totalPathDuration)}</span>
    </div>

    <div class="h-6 border-l border-neutral-300 dark:border-neutral-700" aria-hidden="true"></div>

    <!-- Record GIF Button with FPS selector -->
    <div class="flex items-center gap-1">
      <select
        bind:value={gifFps}
        disabled={isRecording}
        class="text-xs px-1 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800 focus:outline-none disabled:opacity-50"
        title="GIF frame rate"
      >
        <option value={15}>15fps</option>
        <option value={24}>24fps</option>
        <option value={30}>30fps</option>
        <option value={60}>60fps</option>
      </select>
      <button
        title={isRecording ? `Recording... ${recordingProgress}%` : "Record GIF"}
        on:click={async () => {
          if (!isRecording && captureGif) {
            isRecording = true;
            recordingProgress = 0;
            try {
              await captureGif();
            } finally {
              isRecording = false;
              recordingProgress = 0;
            }
          }
        }}
        disabled={isRecording}
        class="p-1.5 rounded transition-colors relative"
        class:bg-red-500={isRecording}
        class:text-white={isRecording}
        class:animate-pulse={isRecording}
        class:hover:bg-neutral-200={!isRecording}
        class:dark:hover:bg-neutral-700={!isRecording}
      >
        {#if isRecording}
          <div class="absolute inset-0 flex items-center justify-center text-xs font-bold">
            {recordingProgress}%
          </div>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="3" fill="currentColor"></circle>
          </svg>
        {/if}
      </button>
    </div>

    <div class="h-6 border-l border-neutral-300 dark:border-neutral-700" aria-hidden="true"></div>

    <!-- Undo/Redo Buttons -->
    <div class="flex items-center gap-1">
      <button 
        title="Undo (Ctrl+Z)" 
        on:click={undo}
        disabled={!canUndo}
        class="p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 7v6h6"></path>
          <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
        </svg>
      </button>
      <button 
        title="Redo (Ctrl+Y)" 
        on:click={redo}
        disabled={!canRedo}
        class="p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 7v6h-6"></path>
          <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"></path>
        </svg>
      </button>
    </div>

    <div class="h-6 border-l border-neutral-300 dark:border-neutral-700" aria-hidden="true"></div>

    <div class="flex items-center gap-3">
      <div class="relative flex flex-col items-center justify-center">
        <button title="Toggle Grid" on:click={() => showGrid.update(v => !v)} class:text-blue-500={$showGrid}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>
        </button>
        {#if $showGrid}
          <div class="absolute top-full left-1/2 mt-2 -translate-x-1/2">
            <select
              class="px-2 py-1 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
              bind:value={selectedGridSize}
              on:change={handleGridSizeChange}
              aria-label="Select grid spacing"
            >
              {#each gridSizeOptions as option}
                <option value={option}>{option}" grid</option>
              {/each}
            </select>
          </div>
        {/if}
      </div>
      <button title="Toggle Ruler" on:click={() => showRuler.update(v => !v)} class:text-blue-500={$showRuler}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0z"></path><path d="m14.5 12.5 2-2"></path><path d="m11.5 9.5 2-2"></path><path d="m8.5 6.5 2-2"></path><path d="m17.5 15.5 2-2"></path></svg>
      </button>
      <button title="Toggle Protractor" on:click={() => showProtractor.update(v => !v)} class:text-blue-500={$showProtractor}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21a9 9 0 1 1 0-18c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M12 3v6l3.7 2.7"></path></svg>
      </button>
      {#if $showProtractor}
        <button title={$protractorLockToRobot ? "Unlock Protractor from Robot" : "Lock Protractor to Robot"} on:click={() => protractorLockToRobot.update(v => !v)} class:text-amber-500={$protractorLockToRobot}>
          {#if $protractorLockToRobot}
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
          {/if}
        </button>
      {/if}
      
      
    </div>

    <!-- Path Editing Tools - Distinct Section -->
    <div class="h-6 border-l-2 border-purple-500 dark:border-purple-400 mx-2" aria-hidden="true"></div>
    
    <div class="flex items-center gap-2 px-2 py-1 rounded-lg bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700">
      <!-- Click to Place Mode Toggle -->
      <button 
        title={$clickToPlaceMode ? "Click-to-Place Mode: ON (Click field to add points)" : "Click-to-Place Mode: OFF"} 
        on:click={() => clickToPlaceMode.update(v => !v)} 
        class="p-1 rounded transition-colors"
        class:bg-purple-500={$clickToPlaceMode}
        class:text-white={$clickToPlaceMode}
        class:hover:bg-purple-200={!$clickToPlaceMode}
        class:dark:hover:bg-purple-800={!$clickToPlaceMode}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M12 2v4"></path>
          <path d="M12 18v4"></path>
          <path d="M2 12h4"></path>
          <path d="M18 12h4"></path>
        </svg>
      </button>

      <div class="w-px h-5 bg-purple-300 dark:bg-purple-600" aria-hidden="true"></div>

      <!-- Mirror Horizontal -->
      <button 
        title="Mirror Path Horizontally (flip left/right)" 
        on:click={mirrorPathsHorizontal}
        class="p-1 rounded hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3"></path>
          <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"></path>
          <path d="M12 20v2"></path>
          <path d="M12 14v2"></path>
          <path d="M12 8v2"></path>
          <path d="M12 2v2"></path>
        </svg>
      </button>

      <!-- Mirror Vertical -->
      <button 
        title="Mirror Path Vertically (flip up/down)" 
        on:click={mirrorPathsVertical}
        class="p-1 rounded hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3"></path>
          <path d="M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"></path>
          <path d="M2 12h4"></path>
          <path d="M10 12h4"></path>
          <path d="M18 12h4"></path>
        </svg>
      </button>
    </div>

    <div class="h-6 border-l border-neutral-300 dark:border-neutral-700 mx-4" aria-hidden="true"></div>

    <div class="flex items-center gap-3">

      <button title="Save trajectory as a file" on:click={() => saveFile()}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
          />
        </svg>
      </button>
      <input
        id="file-input"
        type="file"
        accept=".pp"
        on:change={loadFile}
        class="hidden"
      />
      <label
        for="file-input"
        title="Load trajectory from a file"
        class="cursor-pointer"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
          />
        </svg>
      </label>
      <button
        title="Delete/Reset path"
        on:click={() => {
         startPoint = {
      x: 56,
      y: 8,
      heading: "linear",
      startDeg: 90,
      endDeg: 180
    };
    lines = [
      {
        name: "Path 1",
        endPoint: { x: 56, y: 36, heading: "linear", startDeg: 90, endDeg: 180 },
        controlPoints: [],
        color: getRandomColor(),
      },
    ];
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
          />
        </svg>
      </button>
      <button title="Export path to code" on:click={exportToCode}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"
          />
        </svg>
      </button>
    </div>

    <div class="h-6 border-l border-neutral-300 dark:border-neutral-700 mx-4" aria-hidden="true"></div>

    <div class="flex items-center gap-3">
      <button title="Open Settings" on:click={openSettings}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
      </button>
      <button
        title="Toggle Dark/Light Mode"
        on:click={() => {
          darkMode.toggle();
        }}
      >
        {#if $darkMode === "light"}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-6"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"
            />
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-6"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
            />
          </svg>
        {/if}
      </button>
      <input
        id="robot-input"
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml"
        on:change={loadRobot}
        class="hidden"
      />
      <label
        for="robot-input"
        title="Load Robot Picture from a file"
        class="cursor-pointer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34"></path><polygon points="18 2 22 6 12 16 8 16 8 12 18 2"></polygon></svg>
      </label>
    </div>
  </div>
</div>
{#if dialogOpen}
  <div
    transition:fade={{ duration: 500, easing: cubicInOut }}
    class="bg-black bg-opacity-25 flex flex-col justify-center items-center absolute top-0 left-0 w-full h-full z-[1005]"
  >
    <div
      transition:fly={{ duration: 500, easing: cubicInOut, y: 20 }}
      class="flex flex-col justify-start items-start p-4 bg-white dark:bg-neutral-900 rounded-lg w-full max-w-4xl gap-2.5"
    >
      <div class="flex flex-row justify-between items-center w-full">
        <p class="text-sm font-light text-neutral-700 dark:text-neutral-400">
          Here is the generated code for this path:
        </p>
        <div class="flex items-center gap-2">
          <label for="full-code-export" class="text-sm font-light text-neutral-700 dark:text-neutral-400">Export Full Code</label>
          <input
                  id="export-full-code"
                  type="checkbox"
                  bind:checked={exportFullCode}
                  on:change={exportToCode}
                  class="cursor-pointer"
          />
          <button
                  class=""
                  on:click={() => {
        dialogOpen = false;
      }}
          >
            <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="2"
                    stroke="currentColor"
                    class="size-6 text-neutral-700 dark:text-neutral-400"
            >
              <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      <div class="relative w-full">
        <Highlight language={java} code={exportedCode} class="w-full" />
        <button
                title="Copy code to clipboard"
                use:copy={exportedCode}
                class="absolute bottom-2 right-2 opacity-45 hover:opacity-100 transition-all duration-200"
        >
          <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="1.5"
                  stroke="currentColor"
                  class="size-6"
          >
            <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5A3.375 3.375 0 0 0 6.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0 0 15 2.25h-1.5a2.251 2.251 0 0 0-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 0 0-9-9Z"
            />
          </svg>
        </button>
      </div>
    </div>
  </div>
{/if}
{#if settingsOpen}
  <div
          transition:fade={{ duration: 500, easing: cubicInOut }}
          class="bg-black bg-opacity-25 flex flex-col justify-center items-center absolute top-0 left-0 w-full h-full z-[1005]"
  >
    <div
            transition:fly={{ duration: 500, easing: cubicInOut, y: 20 }}
            class="flex flex-col justify-start items-start p-6 bg-white dark:bg-neutral-900 rounded-lg w-full max-w-md gap-4"
    >
      <div class="flex flex-row justify-between items-center w-full">
        <button
                class=""
                on:click={() => {
            settingsOpen = false;
          }}
        ><svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
                class="size-6 text-neutral-700 dark:text-neutral-400"
        >
          <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M6 18 18 6M6 6l12 12"
          />
        </svg>
        </button>
      </div>

      <div class="relative w-full">
        <div class="flex flex-col w-full justify-start items-start gap-4 text-base">
          <div class="font-semibold text-lg">FPA Settings</div>

          <div class="flex flex-row justify-between items-center w-full">
            <div class="font-light">X Velocity (in/s):</div>
            <input
              class="px-3 py-2 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border focus:outline-none focus:ring-2 focus:ring-blue-500 w-24 text-base"
              step="0.1"
              type="number"
              min="0"
              bind:value={settings.xVelocity}
            />
          </div>

          <div class="flex flex-row justify-between items-center w-full">
            <div class="font-light">Y Velocity (in/s):</div>
            <input
              class="px-3 py-2 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border focus:outline-none focus:ring-2 focus:ring-blue-500 w-24 text-base"
              step="0.1"
              type="number"
              min="0"
              bind:value={settings.yVelocity}
            />
          </div>

          <div class="flex flex-col justify-start items-start w-full gap-1">
            <div class="flex flex-row justify-between items-center w-full">
              <div class="font-light">Angular Velocity:</div>
              <input
                class="px-3 py-2 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border focus:outline-none focus:ring-2 focus:ring-blue-500 w-24 text-base"
                step="0.1"
                type="number"
                min="0"
                bind:value={angularVelocityDisplay}
                on:input={(e) => settings.aVelocity = parseFloat(e.target.value) * Math.PI}
              />
            </div>
            <div class="text-sm text-neutral-500 dark:text-neutral-400 self-end">
              (× π rad/s)
            </div>
          </div>

          <div class="flex flex-row justify-between items-center w-full">
            <div class="font-light">Friction Coefficient:</div>
            <input
              class="px-3 py-2 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border focus:outline-none focus:ring-2 focus:ring-blue-500 w-24 text-base"
              step="0.1"
              type="number"
              min="0"
              bind:value={settings.kFriction}
            />
          </div>

          <div class="w-full h-px bg-neutral-200 dark:bg-neutral-700 my-2"></div>
          
          <div class="font-semibold text-lg">Warnings</div>

          <div class="flex flex-row justify-between items-center w-full">
            <div class="flex flex-col">
              <div class="font-light">Center Line Warning</div>
              <div class="text-xs text-neutral-500 dark:text-neutral-400">Warn when path crosses to opponent's side</div>
            </div>
            <button 
              on:click={() => centerLineWarningEnabled.update(v => !v)}
              class="relative w-12 h-6 rounded-full transition-colors duration-200"
              class:bg-green-500={$centerLineWarningEnabled}
              class:bg-neutral-300={!$centerLineWarningEnabled}
              class:dark:bg-neutral-600={!$centerLineWarningEnabled}
            >
              <div 
                class="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
                class:translate-x-1={!$centerLineWarningEnabled}
                class:translate-x-7={$centerLineWarningEnabled}
              ></div>
            </button>
          </div>


          <div class="flex flex-col gap-2 w-full">
            <div class="font-light">Collision Visualization</div>
            <div class="flex flex-row gap-2">
              <button
                class="px-3 py-1 rounded-full text-sm font-medium transition-colors duration-200"
                class:bg-green-500={$showAllCollisions}
                class:bg-neutral-300={!$showAllCollisions}
                class:dark:bg-neutral-600={!$showAllCollisions}
                on:click={() => { showAllCollisions.set(true); collisionNextSegmentOnly.set(false); }}
              >All Points</button>
              <button
                class="px-3 py-1 rounded-full text-sm font-medium transition-colors duration-200"
                class:bg-green-500={$collisionNextSegmentOnly}
                class:bg-neutral-300={!$collisionNextSegmentOnly}
                class:dark:bg-neutral-600={!$collisionNextSegmentOnly}
                on:click={() => { collisionNextSegmentOnly.set(true); showAllCollisions.set(false); }}
              >Current Segment</button>
              <button
                class="px-3 py-1 rounded-full text-sm font-medium transition-colors duration-200"
                class:bg-red-500={!$showAllCollisions && !$collisionNextSegmentOnly}
                class:bg-neutral-300={$showAllCollisions || $collisionNextSegmentOnly}
                class:dark:bg-neutral-600={$showAllCollisions || $collisionNextSegmentOnly}
                on:click={() => { showAllCollisions.set(false); collisionNextSegmentOnly.set(false); }}
              >Off</button>
            </div>
            <div class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Choose how to visualize robot collision points. "Off" disables all collision overlays.
            </div>
          </div>

            <div class="w-full h-px bg-neutral-200 dark:bg-neutral-700 my-2"></div>

            <div class="font-semibold text-lg">Robot Overlays</div>
            <div class="flex flex-col gap-3 w-full">
              <div class="flex flex-row justify-between items-center w-full">
                <div class="flex flex-col">
                  <div class="font-light">Live Coordinates</div>
                  <div class="text-xs text-neutral-500 dark:text-neutral-400">Show robot position and heading text near robot</div>
                </div>
                <button 
                  on:click={() => { showRobotLiveCoordinates.set(!$showRobotLiveCoordinates); console.log('showRobotLiveCoordinates ->', !$showRobotLiveCoordinates); }}
                  class="relative w-12 h-6 rounded-full transition-colors duration-200"
                  class:bg-green-500={$showRobotLiveCoordinates}
                  class:bg-neutral-300={!$showRobotLiveCoordinates}
                  class:dark:bg-neutral-600={!$showRobotLiveCoordinates}
                >
                  <div 
                    class="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
                    class:translate-x-1={!$showRobotLiveCoordinates}
                    class:translate-x-7={$showRobotLiveCoordinates}
                  ></div>
                </button>
              </div>

              <div class="flex flex-row justify-between items-center w-full">
                <div class="flex flex-col">
                  <div class="font-light">Origin → Corner Lines</div>
                  <div class="text-xs text-neutral-500 dark:text-neutral-400">Draw pink lines from robot origin to each corner</div>
                </div>
                <button 
                  on:click={() => { showRobotOriginToCornerLines.set(!$showRobotOriginToCornerLines); console.log('showRobotOriginToCornerLines ->', !$showRobotOriginToCornerLines); }}
                  class="relative w-12 h-6 rounded-full transition-colors duration-200"
                  class:bg-pink-500={$showRobotOriginToCornerLines}
                  class:bg-neutral-300={!$showRobotOriginToCornerLines}
                  class:dark:bg-neutral-600={!$showRobotOriginToCornerLines}
                >
                  <div 
                    class="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
                    class:translate-x-1={!$showRobotOriginToCornerLines}
                    class:translate-x-7={$showRobotOriginToCornerLines}
                  ></div>
                </button>
              </div>

              <div class="flex flex-row justify-between items-center w-full">
                <div class="flex flex-col">
                  <div class="font-light">Collider Edges</div>
                  <div class="text-xs text-neutral-500 dark:text-neutral-400">Draw lines between corners (collider)</div>
                </div>
                <button 
                  on:click={() => { showRobotColliderEdges.set(!$showRobotColliderEdges); console.log('showRobotColliderEdges ->', !$showRobotColliderEdges); }}
                  class="relative w-12 h-6 rounded-full transition-colors duration-200"
                  class:bg-green-500={$showRobotColliderEdges}
                  class:bg-neutral-300={!$showRobotColliderEdges}
                  class:dark:bg-neutral-600={!$showRobotColliderEdges}
                >
                  <div 
                    class="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
                    class:translate-x-1={!$showRobotColliderEdges}
                    class:translate-x-7={$showRobotColliderEdges}
                  ></div>
                </button>
              </div>
            </div>

            <div class="w-full h-px bg-neutral-200 dark:bg-neutral-700 my-2"></div>

            <div class="font-semibold text-lg">Collision Colors</div>
            <div class="flex flex-col gap-3 w-full">
              <div class="flex flex-row justify-between items-center w-full">
                <div class="flex flex-col">
                  <div class="font-light">Collision Box Color</div>
                  <div class="text-xs text-neutral-500 dark:text-neutral-400">Color used for collider edges/boxes</div>
                </div>
                <input type="color" class="w-10 h-8 p-0 border-0 bg-transparent" value={$collisionBoxColor} on:input={onCollisionBoxColorInput} />
              </div>

              <div class="flex flex-row justify-between items-center w-full">
                <div class="flex flex-col">
                  <div class="font-light">Robot Collision Color</div>
                  <div class="text-xs text-neutral-500 dark:text-neutral-400">Color used for robot-origin overlays and origin dot</div>
                </div>
                <input type="color" class="w-10 h-8 p-0 border-0 bg-transparent" value={$robotCollisionColor} on:input={onRobotCollisionColorInput} />
              </div>
            </div>

          {#if $showCollisionPath}
          <div class="flex flex-row justify-between items-center w-full pl-4">
            <div class="flex flex-col">
              <div class="font-light">Current Segment Only</div>
              <div class="text-xs text-neutral-500 dark:text-neutral-400">Only show collision for current segment</div>
            </div>
            <button 
              on:click={() => collisionNextSegmentOnly.update(v => !v)}
              class="relative w-12 h-6 rounded-full transition-colors duration-200"
              class:bg-green-500={$collisionNextSegmentOnly}
              class:bg-neutral-300={!$collisionNextSegmentOnly}
              class:dark:bg-neutral-600={!$collisionNextSegmentOnly}
            >
              <div 
                class="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
                class:translate-x-1={!$collisionNextSegmentOnly}
                class:translate-x-7={$collisionNextSegmentOnly}
              ></div>
            </button>
          </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

interface BasePoint {
  x: number;
  y: number;
  color?: string;
}

type Point = BasePoint &
  (
    | {
        heading: "linear";
        startDeg: number;
        endDeg: number;
        degrees?: never;
        reverse?: never;
      }
    | {
        heading: "constant";
        degrees: number;
        startDeg?: never;
        endDeg?: never;
        reverse?: never;
      }
    | {
        heading: "tangential";
        degrees?: never;
        startDeg?: never;
        endDeg?: never;
        reverse: boolean;
      }
  );

type ControlPoint = BasePoint;

interface Line {
  endPoint: Point;
  controlPoints: ControlPoint[];
  color: string;
  name?: string;
  waitTime?: number; // Wait time in seconds after reaching this point
}

interface FPALine {
  startPoint: Point;
  endPoint: Point;
  controlPoints: ControlPoint[];
  interpolation: String;
  color: string;
  name?: string;
}

interface FPASettings {
    xVelocity: number;
    yVelocity: number;
    aVelocity: number
    kFriction: number;
    rWidth: number;
    rHeight: number;
}

interface Shape {
    id: string;
    name?: string;
    vertices: BasePoint[];
    color: string;
    fillColor: string;
}

// Multi-path support for path comparison
interface RobotPath {
    id: string;
    name: string;
    color: string;
    startPoint: Point;
    lines: Line[];
    visible: boolean;
  robotWidth?: number;
  robotHeight?: number;
}

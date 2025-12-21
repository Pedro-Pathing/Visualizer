interface BasePoint {
  x: number;
  y: number;
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
  // Optional wait duration (milliseconds). If present, this line represents a pause
  // at the previous/this end point for the specified milliseconds.
  waitMs?: number;
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

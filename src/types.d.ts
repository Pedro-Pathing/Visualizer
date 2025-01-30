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
}

interface FPASettings {
    vMax: number;
    mass: number;
    kFriction: number;
    drag: number;
    aVel: number;
    bTolerance: number;
    sTolerance: number;
    rWidth: number;
    rHeight: number;
}

interface FPALine {
    startPoint: Point;
    endPoint: Point;
    controlPoints: ControlPoint[];
    color: string;
    heading: string;
}

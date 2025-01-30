package MathUtil;

import java.awt.geom.Point2D;

public class SolutionPoints {
    private final double theta;
    private final CubicBezierCurve path;
    private final double T_1;
    private final double T_2;

    public SolutionPoints(double theta, Point2D P_0, Point2D P_1, Point2D P_2, Point2D P_3, double t1, double t2) {
        this.theta = theta;
        T_1 = t1;
        T_2 = t2;
        path = new CubicBezierCurve(P_0, P_1, P_2, P_3);
    }

    public SolutionPoints(double theta, CubicBezierCurve path, double t1, double t2) {
        this.theta = theta;
        this.path = path;
        this.T_1 = t1;
        this.T_2 = t2;
    }

    public double getTheta() {
        return theta;
    }

    public CubicBezierCurve getPath() {
        return path;
    }

    public double getT_1() {
        return T_1;
    }

    public double getT_2() {
        return T_2;
    }

    public double getPathFollowingTargetTime() {
        return T_1 + T_2;
    }
}

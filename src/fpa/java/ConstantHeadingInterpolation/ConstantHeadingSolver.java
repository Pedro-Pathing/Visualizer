package java.ConstantHeadingInterpolation;

import com.cureos.numerics.Calcfc;
import com.cureos.numerics.Cobyla;
import org.apache.commons.math3.analysis.MultivariateFunction;
import org.apache.commons.math3.ode.ContinuousOutputModel;
import org.apache.commons.math3.ode.ExpandableStatefulODE;
import org.apache.commons.math3.ode.nonstiff.GillIntegrator;
import org.apache.commons.math3.optim.*;
import org.apache.commons.math3.optim.nonlinear.scalar.GoalType;
import org.apache.commons.math3.optim.nonlinear.scalar.MultiStartMultivariateOptimizer;
import org.apache.commons.math3.optim.nonlinear.scalar.ObjectiveFunction;
import org.apache.commons.math3.optim.nonlinear.scalar.noderiv.BOBYQAOptimizer;
import org.apache.commons.math3.random.RandomVectorGenerator;
import org.apache.commons.math3.util.FastMath;
//import com.*;

import java.MathUtil.CubicBezierCurve;
import java.MathUtil.RectangleIntersection;
import java.MathUtil.SolutionPoints;
import java.awt.geom.Point2D;

public class ConstantHeadingSolver {
    private final double v_max; //inches per second
    private final double mass; //kg
    private final double mu_k;
    private final double c_1;
    private final double c_2;
    private final Point2D p_0;
    private final Point2D p_3;
    private final double theta_final;
    private final boolean isBlueAlliance;
    private final double theta_initial;
    private final double angularVelocity;
    private final double boundaryTolerance;
    private final double submersibleTolerance;
    private final double robotWidth;
    private final double robotHeight;

    private GillIntegrator integrator = new GillIntegrator(0.005);
    private ContinuousOutputModel outputModel = new ContinuousOutputModel();

    //doubles[0] = theta
    //doubles[1, 2] = square coordinates p_1
    //doubles[3, 4] = square coordinates p_2

    public ConstantHeadingSolver(double vMax, double mass, double muK, double c1, double c2, Point2D p0, Point2D p3, double thetaT2, double boundaryTolerance, double submersibleDistanceTolerance, boolean isBlueAlliance, double thetaInitial, double angularVelocity, double robotWidth, double robotHeight) {
        v_max = vMax;
        this.mass = mass;
        mu_k = muK;
        c_1 = c1;
        c_2 = c2;
        p_0 = p0;
        p_3 = p3;
        theta_final = thetaT2;
        this.isBlueAlliance = isBlueAlliance;
        theta_initial = thetaInitial;
        this.angularVelocity = angularVelocity;
        this.boundaryTolerance = boundaryTolerance;
        this.submersibleTolerance = submersibleDistanceTolerance;
        this.robotWidth = robotWidth;
        this.robotHeight = robotHeight;
    }

    private double[] performOptimization() {
        OptimizationData initialGuess = new InitialGuess(new double[] {theta_final, p_0.getX(), (p_0.getY() + p_3.getY())/2, p_0.getX(), p_3.getY()});
        OptimizationData bounds = new SimpleBounds(new double[] {0, boundaryTolerance + FastMath.min(robotHeight, robotWidth), boundaryTolerance + FastMath.min(robotHeight, robotWidth), boundaryTolerance + FastMath.min(robotHeight, robotWidth), boundaryTolerance + FastMath.min(robotHeight, robotWidth)}, new double[] {FastMath.PI * 2, 72 - boundaryTolerance - FastMath.min(robotHeight, robotWidth), 144 - boundaryTolerance - FastMath.min(robotHeight, robotWidth), 72 - boundaryTolerance - FastMath.min(robotHeight, robotWidth), 144 - boundaryTolerance - FastMath.min(robotHeight, robotWidth)});
        PointValuePair result = null;
        return result.getPoint();
    }

    private Point2D.Double[] solveDifferentialEquation(double theta, CubicBezierCurve bezierCurve) {
        ConstantHeadingDifferentialEquation diffeq = new ConstantHeadingDifferentialEquation(theta, v_max, mass, mu_k, c_1, bezierCurve);
        ExpandableStatefulODE expandableODE = new ExpandableStatefulODE(diffeq);
        expandableODE.setTime(0);
        double[] primaryState = {p_0.getX(),p_0.getY()};
        expandableODE.setPrimaryState(primaryState);
        integrator.setMaxEvaluations(1000);
        integrator.integrate(expandableODE, 30.0); //if you change lines 62 or 63 then also change the denominator or numerator on line 69 respectively

        int n = 1000;
        Point2D.Double[] solutionPoints = new Point2D.Double[n];

        for (int i = 0; i < n; i++) {
            double t = (double) (i * 30) / 999.0;
            outputModel.setInterpolatedTime(t);
            double[] sol = outputModel.getInterpolatedState();
            solutionPoints[i] = new Point2D.Double(sol[0], sol[1]);
        }

        return solutionPoints;
    }

    private double findT1(Point2D.Double[] velocity, double L) {
        int min_dist_index = 0;
        double dist = Math.abs(velocity[min_dist_index].distance(0,0) - L);

        for (int i = 0; i < velocity.length; i++) {
            Point2D point = velocity[i];
            double dist_i = Math.abs(point.distance(0,0) - L);
            if (dist_i < dist) {
                min_dist_index = i;
                dist = dist_i;
            }
        }

        return (double) (min_dist_index * 30)/999;
    }

    private double findT2(double theta) {
        return (FastMath.abs(theta_final - theta) + FastMath.abs(theta_initial - theta))/angularVelocity;
    }

   public SolutionPoints getSolution() {
        double[] solution = performOptimization();
        double theta = solution[0];
        Point2D p_1 = new Point2D.Double(solution[1], solution[2]);
        Point2D p_2 = new Point2D.Double(solution[3], solution[4]);
        CubicBezierCurve path = new CubicBezierCurve(p_0, p_1, p_2, p_3);

        return new SolutionPoints(theta, path, findT1(solveDifferentialEquation(theta, path), path.getArcLength()), findT2(theta));
   }

   public static void main(String[] args) {
        ConstantHeadingSolver constantHeadingSolver = new ConstantHeadingSolver(87, 16.09, 0.1, 10, 15, new Point2D.Double(10,5), new Point2D.Double(10, 110), FastMath.PI/2, 3, 3, true, 0, 6, 12.83, 15.75);
        SolutionPoints solutionPoints = constantHeadingSolver.getSolution();
   }
}

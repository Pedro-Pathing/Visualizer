package java.ConstantHeadingInterpolation;

import org.apache.commons.math3.exception.DimensionMismatchException;
import org.apache.commons.math3.exception.MaxCountExceededException;
import org.apache.commons.math3.geometry.euclidean.twod.Vector2D;
import org.apache.commons.math3.ode.FirstOrderDifferentialEquations;
import org.apache.commons.math3.util.FastMath;

import java.MathUtil.CubicBezierCurve;
import java.awt.geom.Point2D;

public class ConstantHeadingDifferentialEquation implements FirstOrderDifferentialEquations {
    private final double theta;
    private final double v_max; //inches per second
    private final double mass; //kg
    private final double mu_k;
    private final double c_1;
    private final CubicBezierCurve path;

    public ConstantHeadingDifferentialEquation(double theta, double vMax, double mass, double muK, double c1, CubicBezierCurve path) {
        this.theta = theta;
        v_max = vMax;
        this.mass = mass;
        mu_k = muK;
        c_1 = c1;
        this.path = path;
    }

    @Override
    public int getDimension() {
        return 2;
    }

    @Override
    public void computeDerivatives(double v, double[] doubles, double[] doubles1) throws MaxCountExceededException, DimensionMismatchException {
        double t = path.pathInversion(new Point2D.Double(doubles[0], doubles[1]));
        Point2D.Double pathPrime = path.computePathPrimes(t);
        Vector2D pathPrimes = new Vector2D(pathPrime.getX(), pathPrime.getY());

        double scalar = (pathPrimes.dotProduct(new Vector2D(FastMath.cos(theta), FastMath.sin(theta))) * v_max - pathPrimes.getNorm() * ((mu_k * mass) + c_1 * FastMath.abs(FastMath.sin(theta-FastMath.atan2(pathPrime.getY(), pathPrime.getX())))))/pathPrimes.getNormSq();

        doubles1[0] = scalar * pathPrimes.getX();
        doubles1[1] = scalar * pathPrimes.getY();
    }
}

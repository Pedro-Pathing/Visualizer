package java.MathUtil;

import org.apache.commons.math3.geometry.euclidean.twod.Vector2D;
import java.awt.geom.Point2D;

public class RectangleIntersection {

    public static class Rectangle {
        Point2D.Double[] vertices;

        public Rectangle(Point2D.Double[] vertices) {
            this.vertices = vertices;
        }
    }

    // Method to rotate a point around a pivot
    public static Point2D.Double rotatePoint(Point2D.Double p, Point2D.Double pivot, double angle) {
        double rad = Math.toRadians(angle);
        double cos = Math.cos(rad);
        double sin = Math.sin(rad);

        double translatedX = p.x - pivot.x;
        double translatedY = p.y - pivot.y;

        double rotatedX = translatedX * cos - translatedY * sin;
        double rotatedY = translatedX * sin + translatedY * cos;

        return new Point2D.Double(rotatedX + pivot.x, rotatedY + pivot.y);
    }

    // Generate a rectangle given its center, width, height, and rotation
    public static Rectangle createRotatedRectangle(Point2D.Double center, double width, double height, double rotation) {
        double halfWidth = width / 2;
        double halfHeight = height / 2;

        Point2D.Double[] vertices = new Point2D.Double[4];
        vertices[0] = new Point2D.Double(center.x - halfWidth, center.y - halfHeight);
        vertices[1] = new Point2D.Double(center.x + halfWidth, center.y - halfHeight);
        vertices[2] = new Point2D.Double(center.x + halfWidth, center.y + halfHeight);
        vertices[3] = new Point2D.Double(center.x - halfWidth, center.y + halfHeight);

        for (int i = 0; i < vertices.length; i++) {
            vertices[i] = rotatePoint(vertices[i], center, rotation);
        }

        return new Rectangle(vertices);
    }

    // Check if two rectangles intersect using a separating rectangle of width A
    public static double getMinimumSeparatingWidth(Rectangle rect1, Rectangle rect2) {
        double minWidth = Double.MAX_VALUE;

        for (int i = 0; i < rect1.vertices.length; i++) {
            Point2D.Double p1 = rect1.vertices[i];
            Point2D.Double p2 = rect1.vertices[(i + 1) % rect1.vertices.length];

            Point2D.Double edge = new Point2D.Double(p2.x - p1.x, p2.y - p1.y);
            Point2D.Double axis = new Point2D.Double(-edge.y, edge.x);

            double[] rect1Projections = projectRectangle(rect1, axis);
            double[] rect2Projections = projectRectangle(rect2, axis);

            double overlap = getOverlap(rect1Projections, rect2Projections);
            if (overlap == 0) {
                return 0; // Separating rectangle exists
            }

            minWidth = Math.min(minWidth, overlap);
        }

        for (int i = 0; i < rect2.vertices.length; i++) {
            Point2D.Double p1 = rect2.vertices[i];
            Point2D.Double p2 = rect2.vertices[(i + 1) % rect2.vertices.length];

            Point2D.Double edge = new Point2D.Double(p2.x - p1.x, p2.y - p1.y);
            Point2D.Double axis = new Point2D.Double(-edge.y, edge.x);

            double[] rect1Projections = projectRectangle(rect1, axis);
            double[] rect2Projections = projectRectangle(rect2, axis);

            double overlap = getOverlap(rect1Projections, rect2Projections);
            if (overlap == 0) {
                return 0; // Separating rectangle exists
            }

            minWidth = Math.min(minWidth, overlap);
        }

        return minWidth;
    }

    private static double[] projectRectangle(Rectangle rect, Point2D.Double axis) {
        double min = Double.MAX_VALUE;
        double max = -Double.MAX_VALUE;
        double axisLength = Math.sqrt(axis.x * axis.x + axis.y * axis.y);

        for (Point2D.Double vertex : rect.vertices) {
            double projection = (vertex.x * axis.x + vertex.y * axis.y) / axisLength;
            min = Math.min(min, projection);
            max = Math.max(max, projection);
        }

        return new double[]{min, max};
    }

    private static double getOverlap(double[] proj1, double[] proj2) {
        double start = Math.max(proj1[0], proj2[0]);
        double end = Math.min(proj1[1], proj2[1]);
        return Math.max(0, end - start);
    }
}

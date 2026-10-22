import static com.pedropathing.api.Paths.*;
import com.pedropathing.api.Paths;

import com.pedropathing.api.PoseFactory;
import com.pedropathing.math.Pose;
import com.pedropathing.paths.Path;

public class Paths {

    private final PoseFactory poseFactory = PoseFactory.degrees();

    private final Pose start = poseFactory.of(8, 64, 0);
    private final Pose point1 = poseFactory.of(40, 64, 0);
    private final Pose point2 = poseFactory.of(60, 100, -90);
    private final Pose point2Control1 = poseFactory.of(60, 64, 0);
    private final Pose point3Start = poseFactory.of(60, 100, 90);
    private final Pose point3 = poseFactory.of(24, 120, 180);
    private final Pose point3Control1 = poseFactory.of(60, 130, 0);
    private final Pose point3Control2 = poseFactory.of(30, 100, 0);

    public Path path1() {
        return Paths.line(start, point1).constant(point1);
    }

    public Path path2() {
        return Paths.curve(point1, point2Control1, point2).reverseTangent();
    }

    public Path path3() {
        return Paths.curve(point3Start, point3Control1, point3Control2, point3).linear(point3Start, point3);
    }
}

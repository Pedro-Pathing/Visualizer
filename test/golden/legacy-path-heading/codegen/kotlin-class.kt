import com.pedropathing.api.Paths.*
import com.pedropathing.api.Paths
import com.pedropathing.api.PoseFactory
import com.pedropathing.math.Pose
import com.pedropathing.paths.Path

class Paths {

    private val poseFactory = PoseFactory.degrees()

    private val start = poseFactory.of(8.0, 64.0, 0.0)
    private val point1 = poseFactory.of(40.0, 64.0, 0.0)
    private val point2 = poseFactory.of(60.0, 100.0, -90.0)
    private val point2Control1 = poseFactory.of(60.0, 64.0, 0.0)
    private val point3Start = poseFactory.of(60.0, 100.0, 90.0)
    private val point3 = poseFactory.of(24.0, 120.0, 180.0)
    private val point3Control1 = poseFactory.of(60.0, 130.0, 0.0)
    private val point3Control2 = poseFactory.of(30.0, 100.0, 0.0)

    fun path1(): Path = Paths.line(start, point1).constant(point1)

    fun path2(): Path = Paths.curve(point1, point2Control1, point2).reverseTangent()

    fun path3(): Path = Paths.curve(point3Start, point3Control1, point3Control2, point3).linear(point3Start, point3)
}

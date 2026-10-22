import com.pedropathing.api.Paths.*
import com.pedropathing.api.Paths
import com.pedropathing.api.PoseFactory
import com.pedropathing.math.Pose
import com.pedropathing.paths.Path

class Paths {

    private val poseFactory = PoseFactory.degrees()

    private val start = poseFactory.of(20.0, 20.0, 45.0)
    private val point1 = poseFactory.of(80.0, 80.0, 90.0)
    private val point1Control1 = poseFactory.of(80.0, 20.0, 0.0)

    fun path1(): Path = Paths.curve(start, point1Control1, point1).tangent()
}

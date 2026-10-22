import com.pedropathing.api.Paths.*
import com.pedropathing.api.Paths
import com.pedropathing.api.PoseFactory
import com.pedropathing.math.Pose
import com.pedropathing.paths.Path

class Paths {

    private val poseFactory = PoseFactory.degrees()

    private val start = poseFactory.of(56.0, 8.0, 90.0)
    private val point1 = poseFactory.of(56.0, 36.0, 180.0)

    fun path1(): Path = Paths.line(start, point1).linear(start, point1)
}

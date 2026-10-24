package org.firstinspires.ftc.teamcode

import com.pedropathing.api.Paths.*
import com.pedropathing.api.Paths
import com.pedropathing.api.PoseFactory
import com.pedropathing.follower.Follower
import com.pedropathing.math.Pose
import com.pedropathing.paths.Path
import com.pedropathing.ivy.Command
import com.pedropathing.ivy.Scheduler
import com.pedropathing.ivy.Scheduler.schedule
import com.pedropathing.ivy.commands.Commands.*
import com.pedropathing.ivy.groups.Groups.sequential
import com.pedropathing.ivy.pedro.PedroCommands.follow
import com.qualcomm.robotcore.eventloop.opmode.Autonomous
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode

@Autonomous(name = "AutoPath", group = "Autonomous")
class AutoPath : LinearOpMode() {

    private lateinit var follower: Follower

    private val poseFactory = PoseFactory.degrees()

    private val start = poseFactory.of(20.0, 20.0, 45.0)
    private val point1 = poseFactory.of(80.0, 80.0, 90.0)
    private val point1Control1 = poseFactory.of(80.0, 20.0, 0.0)

    // Autonomous routine
    fun autoRoutine(): Command = sequential(
            follow(follower, path1())
    )

    override fun runOpMode() {
        Scheduler.reset()
        follower = Constants.create(hardwareMap)
        follower.setPose(start)
        follower.update()

        waitForStart()
        schedule(autoRoutine())

        while (opModeIsActive()) {
            follower.update()
            Scheduler.execute()

            telemetry.addData("x", follower.pose().x())
            telemetry.addData("y", follower.pose().y())
            telemetry.addData("heading", follower.pose().heading())

            if (follower.currentPath() != null) {
                telemetry.addData("Current path distance remaining", follower.distanceToEndpoint())
                telemetry.addData("Path number", follower.pathIndex())
            }

            telemetry.update()
        }
    }

    fun path1(): Path = Paths.curve(start, point1Control1, point1).tangent()
}

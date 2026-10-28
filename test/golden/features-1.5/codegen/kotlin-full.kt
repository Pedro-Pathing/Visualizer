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
import com.pedropathing.paths.interpolator.Interpolator

@Autonomous(name = "AutoPath", group = "Autonomous")
class AutoPath : LinearOpMode() {

    private lateinit var follower: Follower

    private val poseFactory = PoseFactory.degrees()

    private val start = poseFactory.of(9.0, 60.0, 0.0)
    private val driveout = poseFactory.of(36.0, 60.0, 0.0)
    private val point2 = poseFactory.of(60.0, 84.0, 90.0)
    private val point2Control1 = poseFactory.of(60.0, 60.0, 0.0)
    private val point3 = poseFactory.of(84.0, 108.0, 171.8699)
    private val point3Control1 = poseFactory.of(60.0, 100.0, 0.0)
    private val point3Control2 = poseFactory.of(70.0, 110.0, 0.0)
    private val SweepStart = poseFactory.of(36.0, 60.0, 0.0)
    private val SweepEnd = poseFactory.of(84.0, 108.0, 90.0)
    private val point4 = poseFactory.of(120.0, 72.0, 67.8596)
    private val point4Control1 = poseFactory.of(100.0, 130.0, 0.0)
    private val point4Control2 = poseFactory.of(130.0, 120.0, 0.0)
    private val point4Control3 = poseFactory.of(110.0, 90.0, 0.0)
    private val point4Segment1Start = poseFactory.of(120.0, 72.0, 90.0)
    private val point4Segment1End = poseFactory.of(120.0, 72.0, 45.0)
    private val point4Segment2Target = poseFactory.of(132.0, 132.0, 0.0)
    private val point4Segment3Heading = poseFactory.of(120.0, 72.0, 67.8596)
    private val curvethrough = poseFactory.of(40.0, 24.0, 143.1301)
    private val curvethroughThrough1 = poseFactory.of(100.0, 40.0, 0.0)
    private val curvethroughThrough2 = poseFactory.of(70.0, 20.0, 0.0)

    // Autonomous routine
    fun autoRoutine(): Command = sequential(
            follow(follower, driveout()),
            follow(follower, sweep()),
            follow(follower, path3()),
            follow(follower, curvethrough())
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

    fun driveout(): Path = Paths.line(start, driveout).constant(driveout)

    fun sweep(): Path = Paths.path(Paths.curve(driveout, point2Control1, point2), Paths.curve(point2, point3Control1, point3Control2, point3)).linear(SweepStart, SweepEnd)

    fun path3(): Path = Paths.curve(point3, point4Control1, point4Control2, point4Control3, point4).heading(Interpolator.piecewise().until(0.4, Interpolator.linear(point4Segment1Start, point4Segment1End)).until(0.7, Interpolator.facingPoint(point4Segment2Target)).until(1.0, Interpolator.constant(point4Segment3Heading)))

    fun curvethrough(): Path = Paths.through(point4, curvethroughThrough1, curvethroughThrough2, curvethrough).tangent()
}

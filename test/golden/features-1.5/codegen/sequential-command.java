package org.firstinspires.ftc.teamcode;

import static com.pedropathing.api.Paths.*;
import com.pedropathing.api.Paths;

import com.pedropathing.api.PoseFactory;
import com.pedropathing.follower.Follower;
import com.pedropathing.math.Pose;
import com.pedropathing.paths.Path;
import com.pedropathing.ivy.Command;
import com.pedropathing.ivy.Scheduler;
import static com.pedropathing.ivy.Scheduler.schedule;
import static com.pedropathing.ivy.commands.Commands.*;
import static com.pedropathing.ivy.groups.Groups.sequential;
import static com.pedropathing.ivy.pedro.PedroCommands.follow;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.pedropathing.paths.interpolator.Interpolator;

@Autonomous(name = "Auto", group = "Autonomous")
public class Auto extends LinearOpMode {

    private Follower follower;

    private final PoseFactory poseFactory = PoseFactory.degrees();

    private final Pose start = poseFactory.of(9, 60, 0);
    private final Pose driveout = poseFactory.of(36, 60, 0);
    private final Pose point2 = poseFactory.of(60, 84, 90);
    private final Pose point2Control1 = poseFactory.of(60, 60, 0);
    private final Pose point3 = poseFactory.of(84, 108, 171.8699);
    private final Pose point3Control1 = poseFactory.of(60, 100, 0);
    private final Pose point3Control2 = poseFactory.of(70, 110, 0);
    private final Pose SweepStart = poseFactory.of(36, 60, 0);
    private final Pose SweepEnd = poseFactory.of(84, 108, 90);
    private final Pose point4 = poseFactory.of(120, 72, 67.8596);
    private final Pose point4Control1 = poseFactory.of(100, 130, 0);
    private final Pose point4Control2 = poseFactory.of(130, 120, 0);
    private final Pose point4Control3 = poseFactory.of(110, 90, 0);
    private final Pose point4Segment1Start = poseFactory.of(120, 72, 90);
    private final Pose point4Segment1End = poseFactory.of(120, 72, 45);
    private final Pose point4Segment2Target = poseFactory.of(132, 132, 0);
    private final Pose point4Segment3Heading = poseFactory.of(120, 72, 67.8596);
    private final Pose curvethrough = poseFactory.of(40, 24, 143.1301);
    private final Pose curvethroughThrough1 = poseFactory.of(100, 40, 0);
    private final Pose curvethroughThrough2 = poseFactory.of(70, 20, 0);

    // Autonomous routine
    public Command autoRoutine() {
        return sequential(
            follow(follower, driveout()),
            waitMs(1000),
            follow(follower, sweep()),
            follow(follower, path3()),
            follow(follower, curvethrough())
        );
    }

    @Override
    public void runOpMode() {
        Scheduler.reset();
        follower = Constants.create(hardwareMap);
        follower.setPose(start);
        follower.update();

        waitForStart();
        schedule(autoRoutine());

        while (opModeIsActive()) {
            follower.update();
            Scheduler.execute();

            telemetry.addData("x", follower.pose().x());
            telemetry.addData("y", follower.pose().y());
            telemetry.addData("heading", follower.pose().heading());

            if (follower.currentPath() != null) {
                telemetry.addData("Current path distance remaining", follower.distanceToEndpoint());
                telemetry.addData("Path number", follower.pathIndex());
            }

            telemetry.update();
        }
    }

    public Path driveout() {
        return Paths.line(start, driveout).constant(driveout);
    }

    public Path sweep() {
        return Paths.path(Paths.curve(driveout, point2Control1, point2), Paths.curve(point2, point3Control1, point3Control2, point3)).linear(SweepStart, SweepEnd);
    }

    public Path path3() {
        return Paths.curve(point3, point4Control1, point4Control2, point4Control3, point4).heading(Interpolator.piecewise().until(0.4, Interpolator.linear(point4Segment1Start, point4Segment1End)).until(0.7, Interpolator.facingPoint(point4Segment2Target)).until(1, Interpolator.constant(point4Segment3Heading)));
    }

    public Path curvethrough() {
        return Paths.through(point4, curvethroughThrough1, curvethroughThrough2, curvethrough).tangent();
    }
}

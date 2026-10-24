    private final PoseFactory poseFactory = PoseFactory.degrees();

    private final Pose start = poseFactory.of(20, 20, 45);
    private final Pose point1 = poseFactory.of(80, 80, 90);
    private final Pose point1Control1 = poseFactory.of(80, 20, 0);

    public Path path1() {
        return Paths.curve(start, point1Control1, point1).tangent();
    }
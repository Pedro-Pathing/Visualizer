    private final PoseFactory poseFactory = PoseFactory.degrees();

    private final Pose start = poseFactory.of(56, 8, 90);
    private final Pose point1 = poseFactory.of(56, 36, 180);

    public Path path1() {
        return Paths.line(start, point1).linear(start, point1);
    }
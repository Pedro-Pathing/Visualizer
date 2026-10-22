    private final PoseFactory poseFactory = PoseFactory.degrees();

    private final Pose start = poseFactory.of(56, 8, 90);
    private final Pose path1 = poseFactory.of(56, 36, 180);

    public Path path1() {
        return Paths.line(start, path1).linear(start, path1);
    }
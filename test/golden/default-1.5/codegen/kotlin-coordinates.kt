    private val poseFactory = PoseFactory.degrees()

    private val start = poseFactory.of(56.0, 8.0, 90.0)
    private val path1 = poseFactory.of(56.0, 36.0, 180.0)

    fun path1(): Path = Paths.line(start, path1).linear(start, path1)
<script>
    import {T} from '@threlte/core'
    import { FIELD_SIZE } from '../../config/defaults'
    import { atomicSegments } from '../../utils/pathTraversal'
    import { MeshLineGeometry, MeshLineMaterial } from 'meshline'
    import {OrbitControls, useDraco,useGltf} from  '@threlte/extras'



    //Robot Info
    let { rWidth, rHeight,startPoint,lines,robotPos,robotHeading} = $props();

    let robotX = $derived(robotPos.x - FIELD_SIZE / 2);
    let robotZ = $derived(FIELD_SIZE / 2 - robotPos.y);
    let robotRotY = $derived(-(robotHeading * Math.PI) / 180);

    const FIELD_SCALE = 0.0402
    const dracoLoader = useDraco()
    const gtlf= useGltf('/fields/3d/biobuzz.glb', {dracoLoader})

    let endPoints = $derived(
        atomicSegments(lines).map((l) => ({ x: l.endPoint.x, y: l.endPoint.y }))
        
    );

    $effect(() => {
        console.log('endPoints:', $state.snapshot(endPoints));
        
        
    });
let points = $derived([
            {x: startPoint.x, y: startPoint.y},
            ...endPoints // it pours evrey item in to the list
        ]);

    let linePoints = $derived(
        points.flatMap((p) => [p.x - FIELD_SIZE / 2, -20, FIELD_SIZE / 2 - p.y])
    );
</script>
//thru all the points it goes thru
{#each points as p}
    <T.Mesh position={[p.x - FIELD_SIZE / 2, -20, FIELD_SIZE / 2 - p.y]}>
        <T.SphereGeometry args={[1.5, 1.5, 1.5]} />
        <T.MeshStandardMaterial color="yellow" />
    </T.Mesh>
{/each}

<T.Mesh>
    <T is={MeshLineGeometry} points={linePoints} />
    <T is={MeshLineMaterial}
        lineWidth={3}
        color="yellow"
        resolution={[1, 1]}
    />
</T.Mesh>
<T.PerspectiveCamera makeDefault fov={40} position={[0,130,200]}>
    <OrbitControls
    enableZoom={true}
    target={[0,0,0]}
   />
</T.PerspectiveCamera>
<T.AmbientLight intensity={0.6}/>
<T.DirectionalLight intensity={1.2} position={[5,10,5]}/>
<T.Mesh position={[robotX,-20,robotZ]} rotation={[0,robotRotY,0]}>
    <T.BoxGeometry args={[rWidth*1, 5, rHeight*1]} />
    <T.MeshStandardMaterial color="red" />
</T.Mesh>
{#await gtlf then {scene}}
    <T is={scene} position={[0, -22, 0]} scale={FIELD_SCALE} rotation={[Math.PI / 2, 0, 0]} />

{/await}

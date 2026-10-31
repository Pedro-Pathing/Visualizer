<script lang="ts">
    import {T} from '@threlte/core'
    import { FIELD_SIZE } from '../../config/defaults'
    import { atomicSegments } from '../../utils/pathTraversal'
    import { curveOf } from '../../model/curve'
    import { MeshLineGeometry, MeshLineMaterial } from 'meshline'
    import {OrbitControls, useDraco,useGltf} from  '@threlte/extras'
    import RobotModel from './RobotModel.svelte';
    import type { BasePoint, Path } from '../../types'


    //Robot Info
    let {
        rWidth,
        rHeight,
        startPoint,
        lines,
        robotPos,
        robotHeading,
        robotModelUrl = null,
        robotModelRotation = 0,
    }: {
        rWidth: number
        rHeight: number
        startPoint: BasePoint
        lines: Path[]
        robotPos: BasePoint
        robotHeading: number
        robotModelUrl?: string | null
        robotModelRotation?: number
    } = $props();

    let robotX = $derived(robotPos.x - FIELD_SIZE / 2);
    let robotZ = $derived(FIELD_SIZE / 2 - robotPos.y);
    let robotRotY = $derived((robotHeading * Math.PI) / 180);

    const FIELD_SCALE = 0.0402
    const dracoLoader = useDraco()
    const gtlf= useGltf('/fields/3d/biobuzz.glb', {dracoLoader})
    
    let endPoints = $derived(
        atomicSegments(lines).map((l) =>
         ({ x: l.endPoint.x, y: l.endPoint.y }))
        
    );


let points = $derived([
            {x: startPoint.x, y: startPoint.y},
            ...endPoints 
        ]);
    let curve = $derived.by(() => {
        const result = [startPoint];
        let segStart = startPoint;
        for (const seg of atomicSegments(lines)) {
            result.push(...curveOf(segStart, seg).sample(50).slice(1));
            segStart = seg.endPoint;
        }
        return result;
    });
    let controlPoints= $derived.by( () =>{
        const result=[]
        for(const seg of atomicSegments(lines)){
            for(const p of seg.controlPoints){
                result.push({x:p.x,y:p.y,color:seg.color})
            }
        }
        return result;
    });
    let linePoints = $derived(
        curve.flatMap((p) => 
        [p.x - FIELD_SIZE / 2, -20, FIELD_SIZE / 2 - p.y])
    );
    
</script>
{#each points as p}
    <T.Mesh position={[p.x - FIELD_SIZE / 2, -20, FIELD_SIZE / 2 - p.y]}>
        <T.SphereGeometry args={[1.5, 16, 16]} />
        <T.MeshStandardMaterial color="yellow" />
    </T.Mesh>
{/each}
{#each controlPoints as cP}
    <T.Mesh position={[cP.x-FIELD_SIZE/2,-20,FIELD_SIZE/2-cP.y]}>
        <T.SphereGeometry args={[1,16,16]}/>
        <T.MeshStandardMaterial color={cP.color}/>
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

{#if robotModelUrl}
    <T.Group position={[robotX,0,robotZ]} rotation={[0,robotRotY,0]}>
        {#key robotModelUrl}
          <RobotModel url={robotModelUrl} {rWidth} {rHeight} rotation={robotModelRotation}/>
        {/key}
    </T.Group>
{:else}
<T.DirectionalLight intensity={1.2} position={[5,10,5]}/>
<T.Mesh position={[robotX,-20,robotZ]} rotation={[0,robotRotY,0]}>
        <T.BoxGeometry args={[rWidth*1, 5, rHeight*1]} />
        <T.MeshStandardMaterial color="red" />
</T.Mesh>
{/if}



{#await gtlf then {scene}}
    <T is={scene} position={[0, -22, 0]} scale={FIELD_SCALE} rotation={[Math.PI / 2, 0, 0]} />
{/await}

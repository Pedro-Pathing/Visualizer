<script lang="ts">
    import {T} from '@threlte/core'
    import {useDraco,useGltf} from  '@threlte/extras'
    import { sample } from 'lodash';
    import {Box3,Object3D,Vector3} from 'three'
    import { PI } from 'three/tsl';

    let{url,rWidth,rHeight,rotation=0} = $props();
    const dracoLoader = useDraco()
    const gtlf= useGltf(url, {dracoLoader})

    function fit(scene: Object3D){
        scene.position.set(0,0,0)
        scene.scale.set(1,1,1)
        const box = new Box3().setFromObject(scene)
        const size= box.getSize(new Vector3())
        const center= box.getCenter(new Vector3())
        const swap = Math.abs(Math.round(rotation/90))%2 == 1
        let w =size.x
        let h =size.z
        if(swap){
            w=size.z
            h=size.x
        }
        const scale = Math.min(rWidth/(w ||1),  rHeight/(h||1) )//i do 'h||1' to avoid empty models
        return{
            scale,
            offset:[-center.x*scale,-box.min.y*scale,-center.z*scale]as [number,number,number] 
        }

    }

</script>



{#await gtlf then {scene}}
    {@const f = fit(scene)}
    <T.Group position={[0,-22.5,0]} rotation={[0,(rotation*Math.PI)/180,0]}>
        <T is={scene} position={f.offset} scale={f.scale}/>
    </T.Group>
    
    
{/await}

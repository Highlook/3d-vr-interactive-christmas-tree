import * as THREE from "three";

/** Sparse GPU snow. No allocations or position uploads during animation. */
export class SnowField extends THREE.Points<THREE.BufferGeometry,THREE.ShaderMaterial> {
  readonly count=260;
  constructor() {
    const g=new THREE.BufferGeometry(),p=new Float32Array(260*3),s=new Float32Array(260*3);
    for(let i=0;i<260;i++) {
      p.set([(Math.random()-.5)*29,(Math.random()-.5)*22,-7+Math.random()*13],i*3);
      s.set([Math.random(),Math.random(),Math.random()],i*3);
    }
    g.setAttribute("position",new THREE.BufferAttribute(p,3));g.setAttribute("aSeed",new THREE.BufferAttribute(s,3));
    super(g,new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uPixelRatio:{value:1}},
      vertexShader:`attribute vec3 aSeed;uniform float uTime,uPixelRatio;varying float vAlpha;varying float vShape;void main(){vec3 p=position;p.y=11.-mod(11.-position.y+uTime*(.22+aSeed.x*.30),22.);p.x+=sin(uTime*.25+aSeed.y*40.)*(.15+aSeed.x*.3);p.z+=cos(uTime*.19+aSeed.z*30.)*.12;vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;gl_PointSize=(2.+aSeed.z*3.)*uPixelRatio*17./max(4.,-v.z);vAlpha=(.18+.25*aSeed.y)*smoothstep(-11.,-9.,p.y)*(1.-smoothstep(9.,11.,p.y));vShape=aSeed.z;}`,
      fragmentShader:`varying float vAlpha,vShape;void main(){vec2 p=(gl_PointCoord-.5)*2.;float r=length(p);if(r>1.)discard;float a=exp(-r*r*5.);float angle=atan(p.y,p.x);float arms=pow(abs(cos(angle*3.)),10.)*exp(-r*r*2.);a=mix(a,a*.6+arms*.4,step(.7,vShape));gl_FragColor=vec4(.86,.93,1.,a*vAlpha*(1.-smoothstep(.7,1.,r)));}`,
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false
    }));
    this.name="sparse-snow";this.frustumCulled=false;
  }
  update(time:number){this.material.uniforms.uTime.value=time;}
  resize(dpr:number){this.material.uniforms.uPixelRatio.value=dpr;}
  dispose(){this.geometry.dispose();this.material.dispose();this.removeFromParent();}
}
